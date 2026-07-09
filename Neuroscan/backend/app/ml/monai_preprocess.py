from __future__ import annotations

import os
from typing import Any

from app.ml.volume_io import find_modality_directory

MODALITY_ORDER = ("t1c", "t1n", "t2f", "t2w")


def _is_nifti_path(path: str) -> bool:
    pl = path.lower()
    return pl.endswith(".nii.gz") or pl.endswith(".nii")


def _list_nifti_in_dir(folder: str) -> list[str]:
    out: list[str] = []
    try:
        for name in os.listdir(folder):
            p = os.path.join(folder, name)
            if os.path.isfile(p) and _is_nifti_path(p):
                out.append(p)
    except FileNotFoundError:
        return []
    return out


def _best_nifti_modality_folder(root: str) -> str | None:
    """Pick a directory under root with at least four NIfTI files (prefers exactly four)."""
    if not root or not os.path.isdir(root):
        return None
    root_abs = os.path.abspath(root)
    best: tuple[tuple[int, int, int], str] | None = None
    for dirpath, _, filenames in os.walk(root_abs):
        if "__macosx" in dirpath.lower():
            continue
        niftis: list[str] = []
        for fn in filenames:
            if fn.startswith("."):
                continue
            fp = os.path.join(dirpath, fn)
            if os.path.isfile(fp) and _is_nifti_path(fp):
                niftis.append(fp)
        n = len(niftis)
        if n < 4:
            continue
        key = (0 if n == 4 else 1, n - 4, len(dirpath))
        if best is None or key < best[0]:
            best = (key, dirpath)
    return best[1] if best else None


def resolve_modality_workspace(scan_path: str) -> str:
    """
    Resolve DB ``file_path`` (file or directory) to the folder that should hold BraTS modalities.

    Tries: BraTS-named directory (see ``find_modality_directory``), then a nested folder with
    ≥4 NIfTI files, then the scan extract root.
    """
    p = (scan_path or "").strip()
    if not p:
        raise FileNotFoundError("Scan path is empty")
    root = os.path.dirname(p) if os.path.isfile(p) else p
    root = os.path.abspath(root)
    if not os.path.isdir(root):
        raise FileNotFoundError(f"MRI folder not found: {root}")

    hit = find_modality_directory(root)
    if hit:
        return os.path.abspath(hit)
    nested = _best_nifti_modality_folder(root)
    if nested:
        return os.path.abspath(nested)
    return root


def _fuzzy_pick_modality(mod: str, pool: list[str], used: set[str]) -> str | None:
    def ok(p: str) -> bool:
        return os.path.abspath(p) not in used

    def bn(p: str) -> str:
        return os.path.basename(p).lower()

    if mod == "t1c":
        for p in pool:
            if not ok(p):
                continue
            s = bn(p)
            if "flair" in s:
                continue
            if any(
                k in s
                for k in (
                    "t1ce",
                    "t1c",
                    "t1_ce",
                    "t1-gd",
                    "t1gd",
                    "t1_gd",
                    "t1-gad",
                    "t1_gad",
                )
            ):
                return p
    elif mod == "t1n":
        for p in pool:
            if not ok(p):
                continue
            s = bn(p)
            if "flair" in s or "t2" in s:
                continue
            if "t1n" in s:
                return p
            if "t1" in s and all(x not in s for x in ("ce", "gd", "gad", "flair", "t2")):
                return p
    elif mod == "t2f":
        for p in pool:
            if not ok(p):
                continue
            s = bn(p)
            if "flair" in s or "t2f" in s or "t2_flair" in s or "t2-flair" in s:
                return p
    elif mod == "t2w":
        for p in pool:
            if not ok(p):
                continue
            s = bn(p)
            if "flair" in s or "t2f" in s:
                continue
            if "t2w" in s or "_t2." in s or s.startswith("t2."):
                return p
            if "t2" in s:
                return p
    return None


def _build_file_map(folder_path: str) -> dict[str, str]:
    work = resolve_modality_workspace(folder_path)
    if not os.path.isdir(work):
        raise FileNotFoundError(f"MRI folder not found: {folder_path}")

    file_map: dict[str, str] = {}
    for name in MODALITY_ORDER:
        gz_path = os.path.join(work, f"{name}.nii.gz")
        nii_path = os.path.join(work, f"{name}.nii")
        if os.path.isfile(gz_path):
            file_map[name] = gz_path
        elif os.path.isfile(nii_path):
            file_map[name] = nii_path
        else:
            file_map[name] = gz_path

    if all(os.path.isfile(file_map[n]) for n in MODALITY_ORDER):
        return file_map

    pool = _list_nifti_in_dir(work)
    if len(pool) == 4:
        pool.sort(key=lambda p: os.path.basename(p).lower())
        return {m: p for m, p in zip(MODALITY_ORDER, pool)}

    used: set[str] = set()
    for n in MODALITY_ORDER:
        if os.path.isfile(file_map[n]):
            used.add(os.path.abspath(file_map[n]))

    for mod in MODALITY_ORDER:
        if os.path.isfile(file_map[mod]):
            continue
        pick = _fuzzy_pick_modality(mod, pool, used)
        if pick:
            file_map[mod] = pick
            used.add(os.path.abspath(pick))

    for mod in MODALITY_ORDER:
        if os.path.isfile(file_map[mod]):
            continue
        for p in sorted(pool, key=lambda x: os.path.basename(x).lower()):
            ap = os.path.abspath(p)
            if ap in used:
                continue
            file_map[mod] = p
            used.add(ap)
            break

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
    Input: scan folder path (from DB) — may contain BraTS names or arbitrary NIfTI names.

    Output: torch.Tensor, shape (4, H, W, D), ready for inference.
    """
    file_map = _build_file_map(folder_path)
    _validate_file_map(file_map)
    transforms = build_monai_inference_transforms()
    out: dict[str, Any] = transforms(file_map)
    image = out["image"]

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
