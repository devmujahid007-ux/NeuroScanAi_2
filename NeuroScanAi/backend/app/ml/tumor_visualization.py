"""Grayscale axial preview with optional focal highlight — not model segmentation."""

from __future__ import annotations

import io
import os
import itertools
import base64
from typing import Tuple

import numpy as np
from PIL import Image

from app.ml.volume_io import get_axial_slice, load_volume_and_shape


def should_highlight_tumor_region(result: dict) -> bool:
    """
    Only draw overlay when the model output supports a non-random "positive" read
    and the predicted label is not the benign / no-lesion class.
    """
    if result.get("prediction_reliable") is False:
        return False

    label = (result.get("label") or "").lower()
    if "no significant" in label or "no abnormality" in label:
        return False
    if "no tumor" in label or "no lesion" in label:
        return False

    probs = result.get("probs")
    if isinstance(probs, dict) and probs:
        items = list(probs.items())
        first_name = (items[0][0] or "").lower()
        first_val = float(items[0][1])
        if ("no" in first_name or "significant" in first_name or "lesion" in first_name) and first_val >= 55:
            return False

    return True


def _dilate_mask(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    m = mask.astype(np.float32)
    for _ in range(iterations):
        padded = np.pad(m, 1, mode="edge")
        stacks = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                stacks.append(padded[1 + di : 1 + di + m.shape[0], 1 + dj : 1 + dj + m.shape[1]])
        m = np.maximum.reduce(stacks)
    return m > 0.5


def _brain_foreground_mask(sl: np.ndarray) -> np.ndarray:
    """Rough mask of brain parenchyma vs background."""
    t = float(np.percentile(sl, 10.0))
    return sl > t


def _focal_bright_mask(sl: np.ndarray, max_fraction_of_brain: float = 0.07) -> np.ndarray:
    """
    Small subset of brightest voxels inside the brain mask (not whole cortex).
    Tightens percentile until the mask is a small fraction of foreground.
    """
    brain = _brain_foreground_mask(sl)
    vals = sl[brain]
    if vals.size < 16:
        return np.zeros_like(sl, dtype=bool)

    for pct in (97.5, 98.0, 98.5, 99.0, 99.25, 99.5, 99.75):
        thr = float(np.percentile(vals, pct))
        mask = (sl >= thr) & brain
        frac_in_brain = float(mask.sum()) / float(vals.size + 1e-8)
        if frac_in_brain <= max_fraction_of_brain:
            return mask

    thr = float(np.percentile(vals, 99.5))
    return (sl >= thr) & brain


def build_tumor_highlight_png(file_path: str, inference_result: dict, slice_index: int | None = None) -> Tuple[bytes, bool]:
    """
    Axial RGB PNG: grayscale MRI + optional red overlay on a *small* high-intensity region.
    This is a visualization aid only (intensity-based), not a learned segmentation map.
    """
    vol, (d, _, _) = load_volume_and_shape(file_path)
    idx = int(d // 2) if slice_index is None else int(np.clip(slice_index, 0, max(0, d - 1)))
    sl = get_axial_slice(vol, idx).astype(np.float32)

    p2, p98 = np.percentile(sl, (2.0, 98.0))
    sl_clip = np.clip(sl, p2, p98)
    denom = float(p98 - p2) + 1e-8
    g = ((sl_clip - p2) / denom * 255.0).clip(0, 255).astype(np.uint8)
    rgb = np.stack([g, g, g], axis=-1)

    highlight = should_highlight_tumor_region(inference_result)
    if not highlight:
        img = Image.fromarray(rgb, mode="RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), False

    mask = _focal_bright_mask(sl, max_fraction_of_brain=0.07)
    mask = _dilate_mask(mask, iterations=1)

    if int(mask.sum()) < 12:
        img = Image.fromarray(rgb, mode="RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue(), False

    red_layer = np.zeros_like(rgb, dtype=np.float32)
    red_layer[:, :, 0] = 255.0
    alpha = 0.38
    m = mask.astype(np.float32)[..., None]
    blended = rgb.astype(np.float32) * (1.0 - alpha * m) + red_layer * (alpha * m)
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    img = Image.fromarray(blended, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), True


def _to_numpy(mask_like) -> np.ndarray:
    if hasattr(mask_like, "detach"):
        mask_like = mask_like.detach().cpu().numpy()
    return np.asarray(mask_like)


def _to_class_mask_3d(mask_like) -> np.ndarray:
    """
    Convert model segmentation output to a class-id 3D mask.
    Supports class logits/probabilities and already-labeled masks.
    """
    arr = _to_numpy(mask_like)
    arr = np.squeeze(arr)

    if arr.ndim == 4:
        class_axis = next((idx for idx, size in enumerate(arr.shape) if size == 4), None)
        if class_axis is None:
            raise ValueError(f"Expected one class dimension of size 4, got shape {arr.shape}")
        arr = np.argmax(arr, axis=class_axis)

    if arr.ndim != 3:
        raise ValueError(f"Expected segmentation mask with 3 dimensions, got shape {arr.shape}")
    return arr.astype(np.uint8)


def _align_mask_to_volume(mask_3d: np.ndarray, volume_shape: tuple[int, int, int]) -> np.ndarray:
    if mask_3d.shape == volume_shape:
        return mask_3d
    for perm in itertools.permutations((0, 1, 2)):
        candidate = np.transpose(mask_3d, perm)
        if candidate.shape == volume_shape:
            return candidate
    raise ValueError(f"Could not align mask shape {mask_3d.shape} to MRI volume shape {volume_shape}")


def create_segmentation_overlay(
    scan_id: int,
    file_path: str,
    segmentation_output,
    output_root: str | None = None,
    output_filename: str | None = None,
) -> dict:
    """
    Create a colored tumor mask overlay from segmentation output and save it as PNG.
    Class colors (BraTS-style ids):
      0 background
      1 tumor core / necrotic (red)
      2 edema (green)
      3 enhancing tumor (blue)
      4 enhancing tumor (blue; common SegResNet 3-channel decode)
    """
    vol, (d, h, w) = load_volume_and_shape(file_path)
    mask_3d = _to_class_mask_3d(segmentation_output)
    mask_dhw = _align_mask_to_volume(mask_3d, (d, h, w))

    axial_tumor = (mask_dhw > 0).sum(axis=(1, 2))
    mid = int(np.argmax(axial_tumor)) if int(axial_tumor.max()) > 0 else int(d // 2)
    mri_slice = get_axial_slice(vol, mid).astype(np.float32)
    mask_slice = mask_dhw[mid, :, :].astype(np.uint8)

    p2, p98 = np.percentile(mri_slice, (2.0, 98.0))
    clipped = np.clip(mri_slice, p2, p98)
    base_gray = ((clipped - p2) / (float(p98 - p2) + 1e-8) * 255.0).clip(0, 255).astype(np.uint8)
    base_rgb = np.stack([base_gray, base_gray, base_gray], axis=-1).astype(np.float32)

    color_rgb = np.zeros((h, w, 3), dtype=np.float32)
    color_rgb[mask_slice == 1] = np.array([255, 0, 0], dtype=np.float32)  # tumor core
    color_rgb[mask_slice == 2] = np.array([0, 255, 0], dtype=np.float32)  # edema
    color_rgb[mask_slice == 3] = np.array([0, 0, 255], dtype=np.float32)  # enhancing
    color_rgb[mask_slice == 4] = np.array([0, 0, 255], dtype=np.float32)  # enhancing (label4)

    alpha = 0.45
    region = (mask_slice > 0)[..., None].astype(np.float32)
    blended = base_rgb * (1.0 - alpha * region) + color_rgb * (alpha * region)
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    img = Image.fromarray(blended, mode="RGB")
    out_root = output_root or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "results"))
    os.makedirs(out_root, exist_ok=True)
    file_name = output_filename or f"{scan_id}_mask.png"
    out_path = os.path.join(out_root, file_name)
    img.save(out_path, format="PNG", optimize=True)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return {
        "image_path": out_path,
        "image_base64": b64,
        "image_name": file_name,
        "axial_slice_index": mid,
    }
