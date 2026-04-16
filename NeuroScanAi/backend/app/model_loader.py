import os
from monai.bundle import ConfigParser
import torch

MODEL_DIR = "models/brats_model/brats_mri_segmentation"

_bundle_predictor_cache: tuple | None = None


def load_model():
    if not os.path.exists(MODEL_DIR):
        raise FileNotFoundError("Model directory not found. Please download the model.")

    config = ConfigParser()
    config_path = os.path.join(MODEL_DIR, "configs/inference.json")
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config not found: {config_path}")
    config.read_config(config_path)

    model = config.get_parsed_content("network")

    weights_path = os.path.join(MODEL_DIR, "models/model.pt")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    state_dict = torch.load(weights_path, map_location=device)
    model.load_state_dict(state_dict, strict=True)
    model.to(device)

    model.eval()

    global _bundle_predictor_cache
    _bundle_predictor_cache = (model, device, config)
    print("Model loaded successfully")
    return model, config, device


def get_brats_bundle_predictor():
    """
    Same MONAI bundle instance as ``POST /predict`` after ``load_model()`` runs.
    """
    global _bundle_predictor_cache
    if _bundle_predictor_cache is None:
        load_model()
    model, device, config = _bundle_predictor_cache
    return model, device, config
