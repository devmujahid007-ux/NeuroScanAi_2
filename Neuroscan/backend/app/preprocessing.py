from __future__ import annotations

from typing import Dict

import nibabel as nib
import numpy as np


def load_mri_images(file_paths: Dict[str, str]) -> np.ndarray:
    """Load MRI modalities in strict BraTS order: [t1c, t1n, t2f, t2w]."""
    required_modalities = ("t1c", "t1n", "t2f", "t2w")
    missing = [m for m in required_modalities if m not in file_paths]
    if missing:
        raise ValueError(f"Missing required modalities: {', '.join(missing)}")

    images = []
    for modality in required_modalities:
        img = nib.load(file_paths[modality]).get_fdata(dtype=np.float32)
        images.append(np.asarray(img, dtype=np.float32))

    reference_shape = images[0].shape
    for modality, img in zip(required_modalities, images):
        if img.shape != reference_shape:
            raise ValueError(
                "All MRI volumes must have identical shapes. "
                f"Modality {modality} has shape {img.shape}, expected {reference_shape}."
            )

    return np.stack(images, axis=0).astype(np.float32)


def preprocess(image: np.ndarray) -> np.ndarray:
    """Apply robust per-channel z-score normalization to (4, H, W, D)."""
    if image.ndim != 4 or image.shape[0] != 4:
        raise ValueError(f"Expected input shape (4, H, W, D), got {image.shape}")

    print("Input shape:", image.shape)
    image = image.astype(np.float32, copy=True)

    for i in range(image.shape[0]):
        channel = image[i]
        nonzero_mask = channel > 0
        if np.any(nonzero_mask):
            values = channel[nonzero_mask]
            mean = float(values.mean())
            std = float(values.std())
            channel[nonzero_mask] = (values - mean) / (std + 1e-8)
            channel[~nonzero_mask] = 0.0
        else:
            mean = float(channel.mean())
            std = float(channel.std())
            channel[...] = (channel - mean) / (std + 1e-8)
        image[i] = channel

    return image.astype(np.float32, copy=False)