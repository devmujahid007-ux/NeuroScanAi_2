"""Tumor metrics from 3D segmentation (volume, hemisphere, severity)."""

from __future__ import annotations

import os
from typing import Any

import numpy as np

from app.ml.monai_preprocess import _build_file_map, _validate_file_map
from app.ml.tumor_visualization import _align_mask_to_volume, _to_class_mask_3d


def _t1c_path_from_scan_folder(folder_path: str) -> str:
    file_map = _build_file_map(folder_path)
    _validate_file_map(file_map)
    return file_map["t1c"]


def voxel_volume_mm3_from_scan_folder(folder_path: str) -> float:
    """Product of spatial voxel dimensions (mm³) from the T1c NIfTI header."""
    try:
        import nibabel as nib
    except ImportError as e:
        raise RuntimeError("nibabel is required for voxel spacing") from e

    path = _t1c_path_from_scan_folder(folder_path)
    img = nib.load(path)
    zooms = np.asarray(img.header.get_zooms()[:3], dtype=np.float64)
    zooms = np.where(zooms <= 0, 1.0, zooms)
    return float(zooms[0] * zooms[1] * zooms[2])


def compute_tumor_metrics(
    segmentation_mask,
    reference_volume_shape: tuple[int, int, int],
    voxel_volume_mm3: float,
) -> dict[str, Any]:
    """
    segmentation_mask: model output (torch tensor or numpy),3D labels after alignment.
    reference_volume_shape: (D, H, W) of the loaded MRI volume used for overlay.
    """
    mask_3d = _to_class_mask_3d(segmentation_mask)
    mask_dhw = _align_mask_to_volume(mask_3d, reference_volume_shape)
    tumor = mask_dhw > 0
    voxel_count = int(tumor.sum())
    volume_mm3 = float(voxel_count) * float(voxel_volume_mm3)
    volume_cm3 = volume_mm3 / 1000.0

    if voxel_count == 0:
        return {
            "tumor_detected": False,
            "tumor_positive_voxels": 0,
            "tumor_volume_mm3": 0.0,
            "tumor_volume_cm3": 0.0,
            "tumor_location": "Not applicable (no enhancing or tumor-associated voxels detected by the model)",
            "severity": "None",
            "label_voxel_counts": {str(int(k)): int(v) for k, v in zip(*np.unique(mask_dhw, return_counts=True))},
        }

    coords = np.argwhere(tumor)
    # Volume layout: (D, H, W). Horizontal axis in axial plane is W (columns).
    com_w = float(coords[:, 2].mean())
    mid = (mask_dhw.shape[2] - 1) / 2.0
    # Radiological axial convention: patient's right appears on the viewer's left (lower column index).
    if com_w < mid:
        location = "right cerebral hemisphere"
    elif com_w > mid:
        location = "left cerebral hemisphere"
    else:
        location = "midline / equivocal on this axial plane"

    if volume_cm3 < 5.0:
        severity = "Small"
    elif volume_cm3 <= 20.0:
        severity = "Medium"
    else:
        severity = "Large"

    uniq, cnts = np.unique(mask_dhw, return_counts=True)
    label_counts = {str(int(k)): int(v) for k, v in zip(uniq, cnts)}

    return {
        "tumor_detected": True,
        "tumor_positive_voxels": voxel_count,
        "tumor_volume_mm3": round(volume_mm3, 2),
        "tumor_volume_cm3": round(volume_cm3, 2),
        "tumor_location": location,
        "severity": severity,
        "label_voxel_counts": label_counts,
    }


def save_mri_axial_png(scan_folder: str, out_path: str, slice_index: int | None = None) -> str:
    """Save a single grayscale axial PNG (reference anatomy) for the report."""
    from PIL import Image

    from app.ml.volume_io import get_axial_slice, load_volume_and_shape

    vol, (d, _h, _w) = load_volume_and_shape(scan_folder)
    idx = int(d // 2) if slice_index is None else int(np.clip(slice_index, 0, max(0, d - 1)))
    sl = get_axial_slice(vol, idx).astype(np.float32)
    p2, p98 = np.percentile(sl, (2.0, 98.0))
    clipped = np.clip(sl, p2, p98)
    gray = ((clipped - p2) / (float(p98 - p2) + 1e-8) * 255.0).clip(0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    Image.fromarray(gray, mode="L").save(out_path, format="PNG", optimize=True)
    return out_path
