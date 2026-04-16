import torch
from monai.inferers import sliding_window_inference
import numpy as np
from app.ml.inference_engine import analyze_mri_volume


def predict_segmentation_with_confidence(model, image, device):
    """
    Same sliding-window decode as ``POST /predict`` / ``predict()``.
    Returns (seg uint8 (H,W,D), confidence_pct in [0, 100] from mean max channel prob in tumor voxels).
    """
    if image.ndim != 4 or image.shape[0] != 4:
        raise ValueError(f"Expected input shape (4, H, W, D), got {image.shape}")

    image_t = torch.as_tensor(image, dtype=torch.float32, device=device).unsqueeze(0)
    spatial_shape = tuple(int(v) for v in image_t.shape[2:])
    roi_size = (min(240, spatial_shape[0]), min(240, spatial_shape[1]), min(160, spatial_shape[2]))

    model.eval()
    try:
        with torch.no_grad():
            output = sliding_window_inference(
                inputs=image_t,
                roi_size=roi_size,
                sw_batch_size=1,
                predictor=model,
                overlap=0.5,
            )
    except Exception as e:
        fallback_roi = tuple(min(128, int(v)) for v in image_t.shape[2:])
        print(f"Full-volume inference failed: {e}")
        print(f"Retrying with fallback roi_size={fallback_roi}")
        with torch.no_grad():
            output = sliding_window_inference(
                inputs=image_t,
                roi_size=fallback_roi,
                sw_batch_size=1,
                predictor=model,
                overlap=0.5,
            )

    probs = torch.sigmoid(output).squeeze(0).detach().cpu().numpy().astype(np.float32)
    tc = probs[0] > 0.5
    wt = probs[1] > 0.5
    et = probs[2] > 0.5
    seg = np.where(et, 3, np.where(tc, 1, np.where(wt, 2, 0))).astype(np.uint8)
    print("Output shape:", tuple(output.shape))
    print("Seg unique values:", np.unique(seg))

    max_p = np.maximum(np.maximum(probs[0], probs[1]), probs[2])
    tum = seg > 0
    if np.any(tum):
        conf = float(np.clip(np.mean(max_p[tum]), 0.0, 1.0))
    else:
        conf = float(np.clip(np.mean(max_p), 0.0, 1.0))
    conf_pct = round(conf * 100.0, 2)
    return seg, conf_pct


def predict(model, image, device):
    """Run sliding-window inference and return label map (H, W, D)."""
    seg, _conf = predict_segmentation_with_confidence(model, image, device)
    return seg


def analyze_image(file_path: str) -> dict:
    """
    Backward-compatible analysis entrypoint used by API routers.
    """
    return analyze_mri_volume(file_path)