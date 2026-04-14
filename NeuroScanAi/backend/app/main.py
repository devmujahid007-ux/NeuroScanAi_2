from __future__ import annotations

import os
import shutil
import traceback
from uuid import uuid4
from typing import Dict

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.model_loader import load_model
from app.preprocessing import load_mri_images, preprocess
from app.inference import predict
from app.visualization import save_overlay

app = FastAPI()

UPLOAD_DIR = "data/uploads"
OUTPUT_DIR = "data/outputs"
OUTPUT_FILE_NAME = "result.png"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# Load model once
model, config, device = load_model()


def _save_uploaded_file(file: UploadFile, modality: str) -> str:
    if not file or not file.filename:
        raise ValueError(f"Missing file for modality: {modality}")

    lower_name = file.filename.lower()
    if not (lower_name.endswith(".nii") or lower_name.endswith(".nii.gz")):
        raise ValueError(f"Invalid file type for {modality}. Expected NIfTI (.nii or .nii.gz).")

    ext = ".nii.gz" if lower_name.endswith(".nii.gz") else ".nii"
    safe_name = f"{uuid4().hex}_{modality}{ext}"
    path = os.path.join(UPLOAD_DIR, safe_name)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return path


@app.post("/predict")
async def predict_api(
    t1c: UploadFile = File(...),
    t1n: UploadFile = File(...),
    t2f: UploadFile = File(...),
    t2w: UploadFile = File(...)
):
    saved_paths: Dict[str, str] = {}

    try:
        files_by_modality: Dict[str, UploadFile] = {
            "t1c": t1c,
            "t1n": t1n,
            "t2f": t2f,
            "t2w": t2w,
        }

        for modality in ("t1c", "t1n", "t2f", "t2w"):
            saved_paths[modality] = _save_uploaded_file(files_by_modality[modality], modality)

        image = load_mri_images(saved_paths)
        vis_image = image.copy()
        image = preprocess(image)

        seg = predict(model, image, device)

        output_file_name = OUTPUT_FILE_NAME
        output_path = os.path.join(OUTPUT_DIR, output_file_name)
        save_overlay(vis_image, seg, output_path)

        return {
            "message": "Prediction successful",
            "output_image": output_path,
            "output_image_url": f"/outputs/{output_file_name}",
        }

    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        print("Prediction error:", repr(e))
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Prediction failed: {str(e)}"},
        )
    finally:
        for upload in (t1c, t1n, t2f, t2w):
            try:
                upload.file.close()
            except Exception:
                pass