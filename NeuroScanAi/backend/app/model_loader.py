import os
from monai.bundle import ConfigParser
import torch

MODEL_DIR = "models/brats_model/brats_mri_segmentation"


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

    print("✅ Model loaded successfully")
    return model, config, device