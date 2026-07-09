import matplotlib

matplotlib.use("Agg")  # headless; default GUI backend + uvicorn worker thread hangs/crashes on Windows (tkinter)

import matplotlib.pyplot as plt
import numpy as np


def best_axial_slice_index(seg: np.ndarray) -> int:
    """Same slice rule as ``save_overlay``: max tumor area per axial slice, else middle."""
    tumor_area_by_slice = np.count_nonzero(seg > 0, axis=(0, 1))
    max_tumor_area = int(tumor_area_by_slice.max())
    if max_tumor_area > 0:
        return int(np.argmax(tumor_area_by_slice))
    return int(seg.shape[-1] // 2)


def save_mri_axial_slice_png(vis_image: np.ndarray, slice_idx: int, save_path: str) -> str:
    """
    Grayscale PNG of T1c (channel 0) at one axial index.
    ``vis_image`` is raw float (4, H, W, D) before ``preprocess``, same as ``save_overlay`` input.
    """
    from PIL import Image

    sl = np.asarray(vis_image[0, :, :, slice_idx], dtype=np.float32)
    img_slice = _normalize_mri_slice(sl)
    gray = (np.clip(img_slice, 0.0, 1.0) * 255.0).astype(np.uint8)
    Image.fromarray(gray, mode="L").save(save_path, format="PNG", optimize=True)
    return save_path


def _normalize_mri_slice(img_slice: np.ndarray) -> np.ndarray:
    """Normalize MRI slice to [0, 1]."""
    img_slice = np.asarray(img_slice, dtype=np.float32)
    min_val = float(img_slice.min())
    max_val = float(img_slice.max())
    if max_val <= min_val:
        return np.zeros_like(img_slice, dtype=np.float32)
    return (img_slice - min_val) / (max_val - min_val)


def save_overlay(image: np.ndarray, seg: np.ndarray, save_path: str) -> str:
    """
    Save tumor segmentation overlay on a normalized grayscale MRI slice.

    Label mapping:
    - 0: background (no color)
    - 1: tumor core (red)
    - 2: edema (yellow)
    - 3: enhancing tumor (blue)
    """
    slice_idx = best_axial_slice_index(seg)

    img_slice = image[0, :, :, slice_idx]
    seg_slice = seg[:, :, slice_idx]
    print(np.unique(seg_slice))

    img_slice = _normalize_mri_slice(img_slice)

    # RGB mask with per-class colors applied only on tumor labels.
    color_mask = np.zeros((*seg_slice.shape, 3), dtype=np.float32)
    color_mask[seg_slice == 1] = (1.0, 0.0, 0.0)  # Red
    color_mask[seg_slice == 2] = (1.0, 1.0, 0.0)  # Yellow
    color_mask[seg_slice == 3] = (0.0, 0.0, 1.0)  # Blue

    fig, ax = plt.subplots(figsize=(6, 6))
    ax.imshow(img_slice, cmap="gray", vmin=0.0, vmax=1.0)
    alpha_mask = np.where(seg_slice > 0, 0.5, 0.0).astype(np.float32)
    ax.imshow(color_mask, alpha=alpha_mask)
    ax.axis("off")

    fig.savefig(save_path, bbox_inches="tight", pad_inches=0)
    plt.close(fig)

    return save_path