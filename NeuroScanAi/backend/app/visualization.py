import matplotlib.pyplot as plt
import numpy as np


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
    # Choose the slice with max tumor area so each case is more representative.
    tumor_area_by_slice = np.count_nonzero(seg > 0, axis=(0, 1))
    max_tumor_area = int(tumor_area_by_slice.max())
    slice_idx = int(np.argmax(tumor_area_by_slice)) if max_tumor_area > 0 else image.shape[-1] // 2

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