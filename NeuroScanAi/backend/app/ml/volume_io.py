"""Load NIfTI / DICOM volumes and render 2D slices as PNG bytes."""

from __future__ import annotations

import io
import os
from typing import Tuple

import numpy as np
from PIL import Image

MRI_MODALITY_ORDER = ("t1c", "t1n", "t2f", "t2w")
MRI_ALLOWED_EXTENSIONS = (".nii.gz", ".nii", ".dcm", ".dicom")

try:
    import nibabel as nib
except ImportError:
    nib = None

try:
    import pydicom
except ImportError:
    pydicom = None


def resolve_scan_volume_paths(path: str) -> list[str]:
    """
    Resolve a scan path to ordered modality files.
    Single-file scans are returned as a one-item list for backward compatibility.
    """
    if os.path.isdir(path):
        resolved: list[str] = []
        entries = [entry.name for entry in os.scandir(path) if entry.is_file()]
        lower_name_map = {name.lower(): name for name in entries}
        missing: list[str] = []

        for modality in MRI_MODALITY_ORDER:
            matched_name = None
            for ext in MRI_ALLOWED_EXTENSIONS:
                candidate = f"{modality}{ext}"
                if candidate in lower_name_map:
                    matched_name = lower_name_map[candidate]
                    break
            if matched_name is None:
                missing.append(modality)
                continue
            resolved.append(os.path.join(path, matched_name))

        if missing:
            raise ValueError(
                "MRI scan directory is missing required modalities: "
                + ", ".join(missing)
                + ". Expected order: t1c, t1n, t2f, t2w."
            )

        return resolved

    return [path]


def resolve_primary_volume_path(path: str) -> str:
    return resolve_scan_volume_paths(path)[0]


def _normalize_modality_volume(volume: np.ndarray) -> np.ndarray:
    """
    Normalize one modality independently (z-score on non-zero voxels).
    Falls back safely when variance is extremely small.
    """
    v = np.asarray(volume, dtype=np.float32)
    mask = np.abs(v) > 1e-8
    if not np.any(mask):
        return np.zeros_like(v, dtype=np.float32)

    values = v[mask]
    mean = float(np.mean(values))
    std = float(np.std(values))
    if std < 1e-8:
        out = np.zeros_like(v, dtype=np.float32)
        out[mask] = values - mean
        return out

    out = np.zeros_like(v, dtype=np.float32)
    out[mask] = (values - mean) / std
    return out


def load_four_modalities_tensor(folder_path: str):
    """
    Load required MRI modalities from a scan folder and return
    a torch tensor shaped (4, H, W, D), ordered as:
    t1c, t1n, t2f, t2w
    """
    try:
        import torch
    except ImportError as e:
        raise RuntimeError("PyTorch is required to return a tensor") from e

    if nib is None:
        raise RuntimeError("nibabel is required to load .nii.gz modality files")
    if not folder_path or not os.path.isdir(folder_path):
        raise FileNotFoundError(f"MRI modality folder not found: {folder_path}")

    modality_files = ("t1c.nii.gz", "t1n.nii.gz", "t2f.nii.gz", "t2w.nii.gz")
    volumes: list[np.ndarray] = []
    reference_shape = None

    for name in modality_files:
        path = os.path.join(folder_path, name)
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Missing required modality file: {name}")

        data = np.asanyarray(nib.load(path).dataobj, dtype=np.float32)
        if data.ndim != 3:
            raise ValueError(f"Expected a 3D NIfTI for {name}, got shape {data.shape}")
        if reference_shape is None:
            reference_shape = data.shape
        elif data.shape != reference_shape:
            raise ValueError(
                f"All modalities must share the same shape. "
                f"Expected {reference_shape}, got {data.shape} for {name}"
            )

        volumes.append(_normalize_modality_volume(data))

    stacked = np.stack(volumes, axis=0)  # (4, H, W, D)
    return torch.from_numpy(stacked).float()


def _normalize_slice(slice_2d: np.ndarray) -> np.ndarray:
    s = np.asarray(slice_2d, dtype=np.float32)
    if s.size == 0:
        return np.zeros((1, 1), dtype=np.uint8)
    p2, p98 = np.percentile(s, (2.0, 98.0))
    s = np.clip(s, p2, p98)
    denom = float(p98 - p2) + 1e-8
    s = (s - p2) / denom
    return (np.clip(s, 0, 1) * 255).astype(np.uint8)


def slice_to_png_bytes(gray_uint8: np.ndarray) -> bytes:
    """Encode a 2D grayscale array as PNG."""
    if gray_uint8.ndim != 2:
        raise ValueError("expected 2D slice")
    img = Image.fromarray(gray_uint8, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def load_volume_and_shape(path: str) -> Tuple[np.ndarray, Tuple[int, int, int]]:
    """
    Load volume as numpy array shaped for axial slicing (depth, H, W).
    Returns (volume, (depth, height, width)).
    """
    path = resolve_primary_volume_path(path)
    path_lower = path.lower()
    if path_lower.endswith((".nii", ".nii.gz")):
        if nib is None:
            raise RuntimeError("nibabel is required for NIfTI files")
        img = nib.load(path)
        data = np.asanyarray(img.dataobj, dtype=np.float32)
        if data.ndim == 2:
            data = data[np.newaxis, ...]
        elif data.ndim == 4:
            data = data[..., 0] if data.shape[-1] <= 8 else data[0, ...]
        if data.ndim != 3:
            raise ValueError(f"unsupported NIfTI dimensionality: {data.ndim}")
        # Use the longest axis as "depth" for axial-style scrolling (robust across orientations)
        axis = int(np.argmax(data.shape))
        if axis != 0:
            data = np.moveaxis(data, axis, 0)
        d, h, w = data.shape
        return data, (d, h, w)

    if path_lower.endswith((".dcm", ".dicom")):
        if pydicom is None:
            raise RuntimeError("pydicom is required for DICOM files")
        ds = pydicom.dcmread(path, force=True)
        arr = ds.pixel_array.astype(np.float32)
        if hasattr(ds, "RescaleSlope") and hasattr(ds, "RescaleIntercept"):
            arr = arr * float(ds.RescaleSlope) + float(ds.RescaleIntercept)
        if arr.ndim == 2:
            arr = arr[np.newaxis, ...]
        if arr.ndim == 3 and arr.shape[0] > 1 and arr.shape[-1] <= 4:
            arr = np.transpose(arr, (2, 0, 1))
        if arr.ndim != 3:
            arr = arr.reshape(1, arr.shape[0], arr.shape[1])
        d, h, w = arr.shape
        return arr, (d, h, w)

    raise ValueError(f"unsupported MRI extension: {path}")


def get_axial_slice(volume: np.ndarray, slice_index: int) -> np.ndarray:
    """volume: (D, H, W); returns 2D float32 slice."""
    d = volume.shape[0]
    idx = int(np.clip(slice_index, 0, max(0, d - 1)))
    return volume[idx, :, :]


def get_preview_png(path: str, slice_index: int | None = None) -> Tuple[bytes, int, int]:
    """
    Render one axial slice as PNG. If slice_index is None, uses middle slice.
    Returns (png_bytes, slice_used, total_slices).
    """
    path = resolve_primary_volume_path(path)
    if not path or not os.path.isfile(path):
        raise FileNotFoundError("scan file missing on disk")
    vol, (d, _, _) = load_volume_and_shape(path)
    idx = (d // 2) if slice_index is None else int(slice_index)
    idx = int(np.clip(idx, 0, max(0, d - 1)))
    sl = get_axial_slice(vol, idx)
    gray = _normalize_slice(sl)
    return slice_to_png_bytes(gray), idx, d
