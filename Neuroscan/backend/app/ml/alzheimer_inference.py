"""
Alzheimer MRI classification — separate from tumor BraTS ZIP pipeline.
Loads ``alz_model_accurate.pth`` once (cached).

**Default preprocessing matches typical training:** ResNet-50 transfer learning on PNG/JPG

- ``Resize`` → 224×224 (bilinear, same as ``transforms.Resize((224, 224))`` default)
- ``ToTensor`` → [0, 1]
- ``Normalize(mean=0.5, std=0.5)`` on 3 channels (maps to [-1, 1])

Class order (indices 0..3) must match training:

  MildDemented, ModerateDemented, NonDemented, VeryMildDemented

Optional (not used by default, for experimentation):

- ``ALZ_NORM=imagenet|zscore|minmax`` — alternative norms
- ``ALZ_CROP=1`` — crop black margins before resize
- ``ALZ_CLAHE=1`` — CLAHE on grayscale before resize
- ``ALZ_CLASS_NAMES`` — comma-separated override (must match class count)
"""

from __future__ import annotations

import os
from threading import Lock
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.transforms import InterpolationMode

_ALZ_MODEL: nn.Module | None = None
_ALZ_DEVICE: torch.device | None = None
_ALZ_ERR: str | None = None
_ALZ_LOCK = Lock()

ALZ_MODEL_BASENAME = "alz_model_accurate.pth"

# Index order MUST match the model head / training (ResNet-50 4-class)
_DEFAULT_4_CLASS_NAMES = (
    "MildDemented",
    "ModerateDemented",
    "NonDemented",
    "VeryMildDemented",
)


def _default_checkpoint_path() -> str:
    """
    Prefer ``backend/models/Trained/alz_model_accurate.pth``, then ``backend/models/alz_model_accurate.pth``.
    Override with env ``ALZ_MODEL_PATH`` (handled in ``load_alzheimer_model``).
    """
    models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "models"))
    candidates = [
        os.path.join(models_dir, "Trained", ALZ_MODEL_BASENAME),
        os.path.join(models_dir, ALZ_MODEL_BASENAME),
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return candidates[0]


def _strip_module_prefix(state: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in state.items():
        nk = k[7:] if k.startswith("module.") else k
        out[nk] = v
    return out


def _fc_dims(state: dict[str, Any]) -> tuple[int, int] | None:
    w = state.get("fc.weight")
    if w is None:
        for key, val in state.items():
            if key.endswith("fc.weight") and hasattr(val, "shape") and len(val.shape) == 2:
                ncls, inf = int(val.shape[0]), int(val.shape[1])
                return ncls, inf
        return None
    return int(w.shape[0]), int(w.shape[1])


def _build_resnet(in_features: int, num_classes: int) -> nn.Module:
    if in_features == 512:
        from torchvision.models import resnet18

        m = resnet18(weights=None)
    elif in_features == 2048:
        from torchvision.models import resnet50

        m = resnet50(weights=None)
    else:
        raise ValueError(f"Unsupported classifier input size {in_features} (expected 512 or 2048 for ResNet)")

    m.fc = nn.Linear(in_features, num_classes)
    return m


def load_alzheimer_model() -> tuple[nn.Module, torch.device]:
    """Load and cache the Alzheimer classifier. Raises RuntimeError if missing or invalid."""
    global _ALZ_MODEL, _ALZ_DEVICE, _ALZ_ERR
    with _ALZ_LOCK:
        if _ALZ_ERR is not None:
            raise RuntimeError(_ALZ_ERR)
        if _ALZ_MODEL is not None and _ALZ_DEVICE is not None:
            return _ALZ_MODEL, _ALZ_DEVICE

        path = os.environ.get("ALZ_MODEL_PATH", _default_checkpoint_path())
        if not os.path.isfile(path):
            msg = (
                f"Alzheimer model not found at {path}. Place {ALZ_MODEL_BASENAME} there "
                "or set ALZ_MODEL_PATH to the checkpoint file."
            )
            _ALZ_ERR = msg
            raise RuntimeError(msg)

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        try:
            raw = torch.load(path, map_location=device, weights_only=False)
        except TypeError:
            raw = torch.load(path, map_location=device)

        if isinstance(raw, nn.Module):
            raw.eval()
            _ALZ_MODEL = raw.to(device)
            _ALZ_DEVICE = device
            return _ALZ_MODEL, _ALZ_DEVICE

        state = raw
        if isinstance(raw, dict):
            if "state_dict" in raw and isinstance(raw["state_dict"], dict):
                state = raw["state_dict"]
            elif "model" in raw and isinstance(raw["model"], dict):
                state = raw["model"]
        if not isinstance(state, dict):
            raise RuntimeError("Checkpoint must be a state_dict or nn.Module")

        state = _strip_module_prefix(state)
        dims = _fc_dims(state)
        if dims is None:
            raise RuntimeError("Could not read fc weights from checkpoint")
        ncls, inf = dims
        model = _build_resnet(inf, ncls)
        model.load_state_dict(state, strict=True)
        model.eval()
        _ALZ_MODEL = model.to(device)
        _ALZ_DEVICE = device
        return _ALZ_MODEL, _ALZ_DEVICE


def _clahe_gray_u8(gray_u8: np.ndarray) -> np.ndarray:
    try:
        import cv2

        clahe = cv2.createCLAHE(clipLimit=float(os.environ.get("ALZ_CLAHE_CLIP", "2.0")), tileGridSize=(8, 8))
        return clahe.apply(gray_u8)
    except Exception:
        return gray_u8


def _crop_foreground_gray(gray: Image.Image) -> Image.Image:
    arr = np.asarray(gray, dtype=np.float32)
    if arr.size == 0:
        return gray
    mx = float(np.max(arr))
    thresh = max(1.0, mx * float(os.environ.get("ALZ_CROP_THRESH_FRAC", "0.02")))
    mask = arr > thresh
    if not np.any(mask):
        return gray
    ys, xs = np.where(mask)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    h, w = arr.shape
    pad = max(2, int(0.02 * max(y1 - y0, x1 - x0)))
    y0 = max(0, y0 - pad)
    y1 = min(h - 1, y1 + pad)
    x0 = max(0, x0 - pad)
    x1 = min(w - 1, x1 + pad)
    return gray.crop((x0, y0, x1 + 1, y1 + 1))


def _tensor_per_image_zscore(x: torch.Tensor) -> torch.Tensor:
    c, _, _ = x.shape
    out = torch.empty_like(x)
    for i in range(c):
        ch = x[i]
        m = ch.mean()
        s = ch.std().clamp_min(1e-6)
        out[i] = (ch - m) / s
    return out


def _tensor_minmax_to_neg1_1(x: torch.Tensor) -> torch.Tensor:
    c, _, _ = x.shape
    out = torch.empty_like(x)
    for i in range(c):
        ch = x[i]
        mn = ch.min()
        mx = ch.max()
        rng = (mx - mn).clamp_min(1e-6)
        out[i] = 2.0 * (ch - mn) / rng - 1.0
    return out


def _normalize_tensor(t: torch.Tensor, norm_mode: str) -> torch.Tensor:
    """Apply normalization after ``to_tensor`` (values in [0, 1])."""
    norm_mode = (norm_mode or "half").strip().lower()
    if norm_mode in ("half", "0.5", "training"):
        return transforms.functional.normalize(t, mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5))
    if norm_mode == "imagenet":
        return transforms.functional.normalize(
            t,
            mean=(0.485, 0.456, 0.406),
            std=(0.229, 0.224, 0.225),
        )
    if norm_mode == "minmax":
        return _tensor_minmax_to_neg1_1(t)
    if norm_mode == "zscore":
        return _tensor_per_image_zscore(t)
    # Fallback: training-style [0.5]
    return transforms.functional.normalize(t, mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5))


def _preprocess_norm_mode() -> str:
    return os.environ.get("ALZ_NORM", "half").strip().lower()


def _resize_interp() -> InterpolationMode:
    """Torchvision ``Resize`` default is bilinear — match unless overridden."""
    name = os.environ.get("ALZ_RESIZE_INTERP", "bilinear").strip().lower()
    if name in ("bicubic", "cubic"):
        return InterpolationMode.BICUBIC
    return InterpolationMode.BILINEAR


def _prepare_pil_rgb_224(image_path: str) -> Image.Image:
    """
    Match common training: ``Image.open(...).convert('RGB')`` then ``Resize((224,224))``.
    Optional crop/CLAHE for experimentation (off by default).
    """
    pil = Image.open(image_path)
    use_medical = os.environ.get("ALZ_MEDICAL_PREP", "0").strip() in ("1", "true", "yes")

    if use_medical:
        gray = pil.convert("L")
        if os.environ.get("ALZ_CROP", "0").strip() in ("1", "true", "yes"):
            gray = _crop_foreground_gray(gray)
        arr = np.asarray(gray, dtype=np.uint8)
        if os.environ.get("ALZ_CLAHE", "0").strip() in ("1", "true", "yes"):
            arr = _clahe_gray_u8(arr)
        gray = Image.fromarray(arr, mode="L")
        rgb = Image.merge("RGB", (gray, gray, gray))
    else:
        # Same as typical ImageFolder / ``transforms``: RGB, no CLAHE/crop
        rgb = pil.convert("RGB")

    size = int(os.environ.get("ALZ_INPUT_SIZE", "224"))
    interp = _resize_interp()
    try:
        return transforms.functional.resize(rgb, [size, size], interpolation=interp, antialias=True)
    except TypeError:
        return transforms.functional.resize(rgb, [size, size], interpolation=interp)


def _prepare_batch_tensor(image_path: str, device: torch.device) -> torch.Tensor:
    pil_rgb = _prepare_pil_rgb_224(image_path)
    t = transforms.functional.to_tensor(pil_rgb)
    t = _normalize_tensor(t, _preprocess_norm_mode())
    return t.unsqueeze(0).to(device)


def _class_names_for_k(num_classes: int) -> list[str]:
    raw = os.environ.get("ALZ_CLASS_NAMES", "").strip()
    if raw:
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        if len(parts) == num_classes:
            return parts
    if num_classes == 4:
        return list(_DEFAULT_4_CLASS_NAMES)
    return []


def _label_for_index(idx: int, num_classes: int) -> str:
    names = _class_names_for_k(num_classes)
    if names and 0 <= idx < len(names):
        return names[idx]
    pos = int(os.environ.get("ALZ_POSITIVE_CLASS_INDEX", "1"))
    if num_classes == 2:
        if idx == pos:
            return "Alzheimer detected"
        return "No Alzheimer detected"
    return f"Class {idx}"


def predict_alzheimer_from_image_path(image_path: str) -> dict[str, Any]:
    """
    Run inference on a PNG/JPEG on disk.
    Returns dict with prediction text, confidence 0-100, probs (label -> % string for API).
    """
    if not image_path or not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")

    model, device = load_alzheimer_model()
    batch = _prepare_batch_tensor(image_path, device)

    with torch.no_grad():
        logits = model(batch)
        probs = torch.softmax(logits, dim=1).squeeze(0).detach().cpu().numpy().astype(np.float64)

    num_classes = int(probs.shape[0])
    top_i = int(np.argmax(probs))
    confidence_pct = round(float(probs[top_i]) * 100.0, 2)

    probs_out: dict[str, str] = {}
    for i in range(num_classes):
        label = _label_for_index(i, num_classes)
        probs_out[label] = f"{round(float(probs[i]) * 100.0, 2)}"

    prediction = _label_for_index(top_i, num_classes)
    fin = int(getattr(model.fc, "in_features", 0))
    arch = "ResNet-50" if fin == 2048 else "ResNet-18" if fin == 512 else f"classifier_in={fin}"
    model_ver = f"PyTorch {arch} ({ALZ_MODEL_BASENAME})"

    return {
        "prediction": prediction,
        "confidence": confidence_pct,
        "probs": probs_out,
        "top_class_index": top_i,
        "num_classes": num_classes,
        "model_version": model_ver,
        "prob_vector": probs.tolist(),
        "preprocess": {
            "norm": _preprocess_norm_mode(),
            "resize": f"{int(os.environ.get('ALZ_INPUT_SIZE', '224'))}x{int(os.environ.get('ALZ_INPUT_SIZE', '224'))}",
            "interp": str(_resize_interp()),
            "rgb_convert": os.environ.get("ALZ_MEDICAL_PREP", "0") not in ("1", "true", "yes"),
            "medical_prep": os.environ.get("ALZ_MEDICAL_PREP", "0") in ("1", "true", "yes"),
        },
    }


def predict_alzheimer_uploaded_file(storage_path: str) -> dict[str, Any]:
    """Alias for stored uploads (same as path-based inference)."""
    return predict_alzheimer_from_image_path(storage_path)
