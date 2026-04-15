from __future__ import annotations

import os
from typing import Any


MODALITY_ORDER = ("t1c", "t1n", "t2f", "t2w")


def _build_file_map(folder_path: str) -> dict[str, str]:
    if not folder_path or not os.path.isdir(folder_path):
        raise FileNotFoundError(f"MRI folder not found: {folder_path}")
    file_map: dict[str, str] = {}
    for name in MODALITY_ORDER:
        gz_path = os.path.join(folder_path, f"{name}.nii.gz")
        nii_path = os.path.join(folder_path, f"{name}.nii")
        if os.path.isfile(gz_path):
            file_map[name] = gz_path
        elif os.path.isfile(nii_path):
            file_map[name] = nii_path
        else:
            # Keep expected path for clear missing-modality errors.
            file_map[name] = gz_path
    return file_map


def _validate_file_map(file_map: dict[str, str]) -> None:
    missing = [name for name, path in file_map.items() if not os.path.isfile(path)]
    if missing:
        raise FileNotFoundError(
            "Missing required modality files: "
            + ", ".join(f"{name}.nii.gz" for name in missing)
        )


def build_monai_inference_transforms():
    """
    Shared MONAI preprocessing pipeline for inference.
    Keep this aligned with training transforms to avoid train/inference mismatch.
    """
    try:
        from monai.transforms import (
            Compose,
            ConcatItemsd,
            EnsureChannelFirstd,
            EnsureTyped,
            LoadImaged,
            NormalizeIntensityd,
        )
    except ImportError as e:
        raise RuntimeError("MONAI is required for preprocessing pipeline") from e

    return Compose(
        [
            LoadImaged(keys=list(MODALITY_ORDER)),
            EnsureChannelFirstd(keys=list(MODALITY_ORDER)),
            ConcatItemsd(keys=list(MODALITY_ORDER), name="image", dim=0),
            NormalizeIntensityd(keys="image", nonzero=True, channel_wise=True),
            EnsureTyped(keys="image"),
        ]
    )


def load_and_preprocess_modalities(folder_path: str):
    """
    Input: scan folder path containing
      t1c.nii.gz, t1n.nii.gz, t2f.nii.gz, t2w.nii.gz

    Output: torch.Tensor, shape (4, H, W, D), ready for inference.
    """
    file_map = _build_file_map(folder_path)
    _validate_file_map(file_map)
    transforms = build_monai_inference_transforms()
    out: dict[str, Any] = transforms(file_map)
    image = out["image"]

    # MONAI returns MetaTensor/Tensor in channel-first by default.
    if tuple(image.shape)[0] != 4:
        raise ValueError(f"Expected 4 channels after preprocessing, got shape {tuple(image.shape)}")
    return image


def preprocess_four_channel_tensor(image_tensor):
    """
    Input: 4-channel MRI tensor/array.
    Output: processed tensor ready for inference.
    """
    try:
        from monai.data import MetaTensor
        from monai.transforms import (
            Compose,
            EnsureChannelFirstd,
            EnsureTyped,
            NormalizeIntensityd,
        )
    except ImportError as e:
        raise RuntimeError("MONAI is required for preprocessing pipeline") from e

    data = {"image": MetaTensor(image_tensor)}
    pipeline = Compose(
        [
            EnsureChannelFirstd(keys="image"),
            NormalizeIntensityd(keys="image", nonzero=True, channel_wise=True),
            EnsureTyped(keys="image"),
        ]
    )
    out = pipeline(data)["image"]
    if tuple(out.shape)[0] != 4:
        raise ValueError(f"Expected 4 channels, got {tuple(out.shape)}")
    return out

