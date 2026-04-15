from __future__ import annotations

import os
import shutil
import traceback
from uuid import uuid4
from typing import Dict

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.model_loader import load_model
from app.preprocessing import load_mri_images, preprocess
from app.inference import predict
from app.visualization import save_overlay
from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.patients import router as patients_router
from app.routers.upload import router as upload_router
from app.routers.analyses import router as analyses_router, api_router as analyses_api_router
from app.routers.mri_preview import router as mri_preview_router
from app.routers.stats import router as stats_router

app = FastAPI()

UPLOAD_DIR = "data/uploads"
OUTPUT_DIR = "data/outputs"
OUTPUT_FILE_NAME = "result.png"
LEGACY_UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(LEGACY_UPLOADS_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")
app.mount("/uploads", StaticFiles(directory=LEGACY_UPLOADS_DIR), name="uploads")

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(patients_router)
app.include_router(upload_router)
app.include_router(analyses_router)
app.include_router(analyses_api_router)
app.include_router(mri_preview_router)
app.include_router(stats_router)

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