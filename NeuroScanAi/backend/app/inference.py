import torch
from monai.inferers import sliding_window_inference
import numpy as np
from app.ml.inference_engine import analyze_mri_volume


def predict(model, image, device):
    """Run sliding-window inference and return label map (H, W, D)."""
    if image.ndim != 4 or image.shape[0] != 4:
        raise ValueError(f"Expected input shape (4, H, W, D), got {image.shape}")

    image = torch.as_tensor(image, dtype=torch.float32, device=device).unsqueeze(0)
    spatial_shape = tuple(int(v) for v in image.shape[2:])
    roi_size = (min(240, spatial_shape[0]), min(240, spatial_shape[1]), min(160, spatial_shape[2]))

    model.eval()
    try:
        with torch.no_grad():
            output = sliding_window_inference(
                inputs=image,
                roi_size=roi_size,
                sw_batch_size=1,
                predictor=model,
                overlap=0.5,
            )
    except Exception as e:
        fallback_roi = tuple(min(128, int(v)) for v in image.shape[2:])
        print(f"Full-volume inference failed: {e}")
        print(f"Retrying with fallback roi_size={fallback_roi}")
        with torch.no_grad():
            output = sliding_window_inference(
                inputs=image,
                roi_size=fallback_roi,
                sw_batch_size=1,
                predictor=model,
                overlap=0.5,
            )

    # BraTS MONAI bundle uses sigmoid + threshold for multi-label channels.
    probs = torch.sigmoid(output).squeeze(0).detach().cpu().numpy().astype(np.float32)
    tc = probs[0] > 0.5  # Tumor core
    wt = probs[1] > 0.5  # Whole tumor
    et = probs[2] > 0.5  # Enhancing tumor

    # Convert multi-label channels to single display map: 0/1/2/3.
    seg = np.where(et, 3, np.where(tc, 1, np.where(wt, 2, 0))).astype("uint8")
    print("Output shape:", tuple(output.shape))
    print("Seg unique values:", np.unique(seg))

    return seg


def analyze_image(file_path: str) -> dict:
    """
    Backward-compatible analysis entrypoint used by API routers.
    """
    return analyze_mri_volume(file_path)