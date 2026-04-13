"""
MRI analysis entrypoint — uses ``app.ml.inference_engine`` (``best_model.pth``) when available.
"""

from app.ml.inference_engine import analyze_mri_volume


def analyze_image(file_path: str) -> dict:
    return analyze_mri_volume(file_path)
