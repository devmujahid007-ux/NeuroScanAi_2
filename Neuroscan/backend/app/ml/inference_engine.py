"""
Load ``best_model.pth`` (or ``TUMOR_MODEL_PATH``) and run slice-based inference.

No deterministic or hash-based mock results: if the volume cannot be read, PyTorch
is unavailable, weights are missing, or the checkpoint does not produce usable
softmax outputs, inference raises ``InferenceError`` for the API layer to surface
as an HTTP error. Deploy trained weights to ``backend/model/best_model.pth``.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODEL_PATH = os.path.join(_BACKEND_DIR, "model", "best_model.pth")
NUM_CLASSES = int(os.getenv("TUMOR_NUM_CLASSES", "4"))
CLASS_LABELS = os.getenv(
    "TUMOR_CLASS_LABELS",
    "No significant lesion,Glioma likely,Meningioma likely,Pituitary / other mass",
).split(",")

# Reject only if averaged softmax is *almost* exactly uniform (broken / random head).
_UNIFORM_MAX_DEVIATION = float(os.getenv("TUMOR_UNIFORM_THRESHOLD", "0.01"))
# Below this max class probability, softmax is too flat to support a clinical "winner" (still returned, but flagged).
MIN_MAX_CLASS_PROB = float(os.getenv("TUMOR_MIN_MAX_PROB", "0.38"))
# Top-1 minus top-2; below this, classes are ambiguous.
MIN_TOP_MARGIN = float(os.getenv("TUMOR_MIN_TOP_MARGIN", "0.05"))

_MODEL = None
_MODEL_LOAD_ERROR: str | None = None
_SEG_MODEL = None
_SEG_MODEL_LOAD_ERROR: str | None = None


class InferenceError(Exception):
    """Raised when real neural network inference cannot be completed."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def get_torch_device():
    try:
        import torch
    except ImportError as e:
        raise InferenceError("pytorch_missing", "PyTorch is not installed; cannot run inference.") from e
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _validate_classifier_head(model: Any, num_classes: int) -> str | None:
    """Ensure loaded weights match expected class count (avoids silent strict=False mismatch)."""
    try:
        import torch
        import torch.nn as nn
    except ImportError:
        return None
    if hasattr(model, "fc") and isinstance(model.fc, nn.Linear):
        if int(model.fc.out_features) != int(num_classes):
            return (
                f"Checkpoint classifier outputs {model.fc.out_features} classes but "
                f"TUMOR_NUM_CLASSES={num_classes}. Fix the env or use a matching checkpoint."
            )
    return None


def _assess_prediction_quality(probs: np.ndarray) -> tuple[bool, str | None, float, float]:
    """
    Returns (prediction_reliable, warning_or_none, max_p, margin).
    Near-random 4-way softmax (~25% each) => not reliable.
    """
    p = np.asarray(probs, dtype=np.float64).ravel()
    n = p.size
    if n < 2:
        return False, "Invalid probability vector.", float(np.max(p)), 0.0
    max_p = float(np.max(p))
    sorted_p = np.sort(p)[::-1]
    margin = float(sorted_p[0] - sorted_p[1])
    chance = 1.0 / n

    if max_p < MIN_MAX_CLASS_PROB:
        return (
            False,
            (
                f"Maximum class probability is {max_p * 100:.1f}% (below {MIN_MAX_CLASS_PROB * 100:.0f}%); "
                "the model is not strongly favoring any class. Replace or retrain best_model.pth if this persists."
            ),
            max_p,
            margin,
        )
    if margin < MIN_TOP_MARGIN:
        return (
            False,
            (
                f"Top class margin is only {margin * 100:.1f} percentage points; "
                "the leading classes are nearly tied. Interpret as ambiguous."
            ),
            max_p,
            margin,
        )
    if max_p < chance * 1.25:
        return (
            False,
            "Softmax is barely above random chance for the number of classes; verify the checkpoint is trained.",
            max_p,
            margin,
        )
    return True, None, max_p, margin


def _prepare_slice_tensor(slice_2d: np.ndarray, size: int = 224):
    try:
        import torch
    except ImportError as e:
        raise InferenceError("pytorch_missing", "PyTorch is not installed; cannot run inference.") from e
    from PIL import Image

    s = np.asarray(slice_2d, dtype=np.float32)
    p2, p98 = np.percentile(s, (2.0, 98.0))
    s = np.clip(s, p2, p98)
    s = (s - p2) / (float(p98 - p2) + 1e-8)
    img = Image.fromarray((np.clip(s, 0, 1) * 255).astype(np.uint8), mode="L")
    img = img.resize((size, size), Image.Resampling.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).unsqueeze(0).unsqueeze(0)
    return t


def _load_torch_model():
    global _MODEL, _MODEL_LOAD_ERROR
    if _MODEL is not None:
        return _MODEL

    _MODEL_LOAD_ERROR = None

    custom_path = os.getenv("TUMOR_MODEL_PATH", "").strip()
    path = custom_path or MODEL_PATH
    if not os.path.isfile(path):
        _MODEL_LOAD_ERROR = f"No model weights file at {path}. Place best_model.pth or set TUMOR_MODEL_PATH."
        logger.warning("Tumor model: %s", _MODEL_LOAD_ERROR)
        return None

    try:
        import torch
        from app.ml.tumor_net import build_model
    except ImportError as e:
        _MODEL_LOAD_ERROR = str(e)
        logger.warning("Tumor model import failed: %s", e)
        return None

    try:
        try:
            ckpt = torch.load(path, map_location="cpu", weights_only=False)
        except TypeError:
            ckpt = torch.load(path, map_location="cpu")
    except Exception as e:
        _MODEL_LOAD_ERROR = f"Failed to load checkpoint: {e}"
        logger.exception("torch.load failed")
        return None

    model = None
    if hasattr(torch.jit, "ScriptModule") and isinstance(ckpt, torch.jit.ScriptModule):
        model = ckpt
    elif isinstance(ckpt, torch.nn.Module):
        model = ckpt
    elif isinstance(ckpt, dict):
        if "model" in ckpt and isinstance(ckpt["model"], torch.nn.Module):
            model = ckpt["model"]
        elif "state_dict" in ckpt:
            model = build_model(NUM_CLASSES)
            state = ckpt["state_dict"]
            try:
                model.load_state_dict(state, strict=True)
            except Exception:
                model.load_state_dict(state, strict=False)
        elif "model_state_dict" in ckpt:
            model = build_model(NUM_CLASSES)
            try:
                model.load_state_dict(ckpt["model_state_dict"], strict=True)
            except Exception:
                model.load_state_dict(ckpt["model_state_dict"], strict=False)
        else:
            model = build_model(NUM_CLASSES)
            try:
                model.load_state_dict(ckpt, strict=False)
            except Exception as e:
                logger.warning("Could not load state_dict from checkpoint keys=%s err=%s", list(ckpt.keys())[:12], e)
                model = None

    if model is None:
        _MODEL_LOAD_ERROR = "Unrecognized checkpoint format (expected state_dict or full module)."
        return None

    head_err = _validate_classifier_head(model, NUM_CLASSES)
    if head_err:
        _MODEL_LOAD_ERROR = head_err
        logger.warning("Tumor model head validation: %s", head_err)
        return None

    model.eval()
    _MODEL = model
    logger.info("Loaded tumor model from %s", path)
    return _MODEL


def get_inference_status() -> dict:
    """Diagnostics for health checks and the doctor dashboard (no patient volume I/O)."""
    custom_path = os.getenv("TUMOR_MODEL_PATH", "").strip()
    path = custom_path or MODEL_PATH
    out: dict[str, Any] = {
        "weights_path": path,
        "weights_exist": os.path.isfile(path),
        "num_classes": NUM_CLASSES,
        "class_labels": [x.strip() for x in CLASS_LABELS if x.strip()],
        "pytorch_available": False,
        "model_loaded": False,
        "last_load_error": _MODEL_LOAD_ERROR,
    }
    try:
        import torch

        out["pytorch_available"] = True
        out["torch_version"] = torch.__version__
    except ImportError:
        out["pytorch_available"] = False

    if out["weights_exist"] and out["pytorch_available"]:
        m = _load_torch_model()
        out["model_loaded"] = m is not None
        out["last_load_error"] = _MODEL_LOAD_ERROR

    return out


def get_loaded_model_or_error():
    model = _load_torch_model()
    if model is None:
        msg = _MODEL_LOAD_ERROR or "Model could not be loaded."
        raise InferenceError("model_unavailable", msg)
    return model


def _build_segmentation_model(in_channels: int, out_channels: int):
    try:
        from monai.networks.nets import SegResNet
    except ImportError as e:
        raise InferenceError("model_unavailable", f"Missing MONAI/PyTorch dependency: {e}") from e

    blocks_down = tuple(int(x.strip()) for x in os.getenv("MONAI_SEG_BLOCKS_DOWN", "1,2,2,4").split(",") if x.strip())
    blocks_up = tuple(int(x.strip()) for x in os.getenv("MONAI_SEG_BLOCKS_UP", "1,1,1").split(",") if x.strip())
    init_filters = int(os.getenv("MONAI_SEG_INIT_FILTERS", "16"))
    dropout_prob = float(os.getenv("MONAI_SEG_DROPOUT_PROB", "0.2"))

    return SegResNet(
        spatial_dims=3,
        in_channels=in_channels,
        out_channels=out_channels,
        init_filters=init_filters,
        blocks_down=blocks_down,
        blocks_up=blocks_up,
        dropout_prob=dropout_prob,
    )


def get_loaded_segmentation_model_or_error():
    """
    Load trained MONAI 3D segmentation checkpoint for inference.
    """
    global _SEG_MODEL, _SEG_MODEL_LOAD_ERROR
    if _SEG_MODEL is not None:
        return _SEG_MODEL

    try:
        import torch
    except ImportError as e:
        raise InferenceError("model_unavailable", f"Missing PyTorch dependency: {e}") from e

    checkpoint_path = os.getenv("SEG_MODEL_PATH", "").strip()
    if not checkpoint_path:
        checkpoint_path = os.path.join(
            _BACKEND_DIR,
            "models",
            "brats_model",
            "brats_mri_segmentation",
            "models",
            "model.pt",
        )
    if not os.path.isfile(checkpoint_path):
        _SEG_MODEL_LOAD_ERROR = f"No segmentation checkpoint found at {checkpoint_path}"
        raise InferenceError("model_unavailable", _SEG_MODEL_LOAD_ERROR)

    try:
        in_channels = int(os.getenv("MONAI_SEG_IN_CHANNELS", "4"))
        out_channels = int(os.getenv("MONAI_SEG_OUT_CHANNELS", "3"))
        model = _build_segmentation_model(in_channels, out_channels)

        device = get_torch_device()
        model = model.to(device)
        state_dict = torch.load(checkpoint_path, map_location=device)
        if isinstance(state_dict, dict) and "state_dict" in state_dict:
            state_dict = state_dict["state_dict"]
        model.load_state_dict(state_dict)
        model.eval()
    except Exception as e:
        _SEG_MODEL_LOAD_ERROR = f"Failed to load MONAI segmentation checkpoint: {e}"
        raise InferenceError("model_unavailable", _SEG_MODEL_LOAD_ERROR) from e

    _SEG_MODEL = model
    return _SEG_MODEL


def analyze_mri_volume(file_path: str) -> dict:
    """Return label, confidence, disease_type, model_version, probs, source=pytorch."""
    from app.ml.volume_io import get_axial_slice, load_volume_and_shape, resolve_scan_volume_paths

    volume_paths = resolve_scan_volume_paths(file_path)
    logger.info(
        "Starting MRI analysis for %s using %d modality file(s)",
        os.path.basename(file_path),
        len(volume_paths),
    )

    try:
        vol, (d, _, _) = load_volume_and_shape(file_path)
        logger.info("Loaded volume with shape %s", (d, _, _))
    except Exception as e:
        logger.exception("volume load failed: %s", e)
        raise InferenceError(
            "volume_load_failed",
            f"Could not read MRI volume (unsupported, corrupt, or empty file): {e}",
        ) from e

    model = _load_torch_model()
    if model is None:
        msg = _MODEL_LOAD_ERROR or "Model could not be loaded."
        raise InferenceError("model_unavailable", msg)

    try:
        import torch
    except ImportError as e:
        raise InferenceError("pytorch_missing", "PyTorch is not installed; cannot run inference.") from e
    device = get_torch_device()
    model = model.to(device)

    indices = sorted(set(int(x) for x in [d // 4, d // 2, (3 * d) // 4, max(0, d - 1)] if d > 0))
    if not indices:
        indices = [0]

    logger.info("Running inference on %d slices", len(indices))
    probs_accum = None
    with torch.no_grad():
        for idx in indices:
            sl = get_axial_slice(vol, idx)
            t = _prepare_slice_tensor(sl).to(device)
            logits = model(t)
            pr = torch.softmax(logits, dim=1).detach().cpu().numpy()[0]
            probs_accum = pr if probs_accum is None else probs_accum + pr
        probs = probs_accum / max(len(indices), 1)

        expected_uniform = 1.0 / len(probs)
        max_deviation = max(abs(float(p) - expected_uniform) for p in probs)
        if max_deviation < _UNIFORM_MAX_DEVIATION:
            logger.warning(
                "Softmax too uniform (max deviation %.4f < %.4f); model may be untrained.",
                max_deviation,
                _UNIFORM_MAX_DEVIATION,
            )
            raise InferenceError(
                "model_unreliable",
                "Model outputs are near-uniform across classes; the checkpoint may be untrained or incompatible. "
                "Replace with a trained best_model.pth matching this architecture and class count.",
            )

        cls = int(np.argmax(probs))
        confidence = float(round(100.0 * float(probs[cls]), 1))
        labels = [x.strip() for x in CLASS_LABELS if x.strip()]
        if cls < len(labels):
            label = labels[cls]
        else:
            label = f"Class {cls}"
        disease_type = "tumor"

        prediction_reliable, quality_warning, max_p, margin = _assess_prediction_quality(probs)

    logger.info(
        "Analysis complete: %s (%.1f%% confidence, reliable=%s)",
        label,
        confidence,
        prediction_reliable,
    )
    return {
        "label": label,
        "disease_type": disease_type,
        "confidence": min(99.9, confidence),
        "model_version": os.path.basename(os.getenv("TUMOR_MODEL_PATH", "").strip() or "best_model.pth"),
        "probs": {
            labels[i] if i < len(labels) else str(i): round(float(probs[i]) * 100, 2)
            for i in range(len(probs))
        },
        "source": "pytorch",
        "prediction_reliable": prediction_reliable,
        "quality_warning": quality_warning,
        "max_probability": round(max_p * 100, 2),
        "probability_margin": round(margin * 100, 2),
    }


def probs_to_json(probs: Any) -> str | None:
    if probs is None:
        return None
    try:
        return json.dumps(probs)
    except Exception:
        return None


