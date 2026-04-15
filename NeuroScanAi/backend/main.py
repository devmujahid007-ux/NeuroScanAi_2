import os
import shutil
import traceback
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database.db import init_db
from app.routers import auth, upload, users, analyses, stats, patients, mri_preview
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.model_loader import load_model
from app.preprocessing import load_mri_images, preprocess
from app.inference import predict
from app.visualization import save_overlay

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown

app = FastAPI(title="TAD Backend", version="2.0.0", lifespan=lifespan)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(mri_preview.router)
app.include_router(users.router)
app.include_router(analyses.router)
app.include_router(analyses.api_router)
app.include_router(stats.router)
app.include_router(patients.router)

# Serve uploaded files.
# Routers save MRI data/results under backend/uploads, so static mount must match.
UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# `/predict` pipeline writes overlays to backend/data/outputs.
OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "outputs"))
TEMP_UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "uploads"))
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")

# Load segmentation model once for `/predict` endpoint.
model, config, device = load_model()


def _save_uploaded_file(file: UploadFile, modality: str) -> str:
    if not file or not file.filename:
        raise ValueError(f"Missing file for modality: {modality}")
    lower_name = file.filename.lower()
    if not (lower_name.endswith(".nii") or lower_name.endswith(".nii.gz")):
        raise ValueError(f"Invalid file type for {modality}. Expected NIfTI (.nii or .nii.gz).")

    ext = ".nii.gz" if lower_name.endswith(".nii.gz") else ".nii"
    saved_name = f"{uuid4().hex}_{modality}{ext}"
    out_path = os.path.join(TEMP_UPLOAD_DIR, saved_name)
    with open(out_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    return out_path


@app.post("/predict")
async def predict_api(
    t1c: UploadFile = File(...),
    t1n: UploadFile = File(...),
    t2f: UploadFile = File(...),
    t2w: UploadFile = File(...),
):
    saved_paths = {}
    try:
        files_by_modality = {"t1c": t1c, "t1n": t1n, "t2f": t2f, "t2w": t2w}
        for modality in ("t1c", "t1n", "t2f", "t2w"):
            saved_paths[modality] = _save_uploaded_file(files_by_modality[modality], modality)

        image = load_mri_images(saved_paths)
        vis_image = image.copy()
        image = preprocess(image)
        seg = predict(model, image, device)

        output_file_name = f"result_{uuid4().hex}.png"
        output_path = os.path.join(OUTPUT_DIR, output_file_name)
        save_overlay(vis_image, seg, output_path)

        tumor_voxels = int(np.count_nonzero(np.asarray(seg) > 0))
        return {
            "message": "Tumor Detected" if tumor_voxels > 0 else "No Tumor Detected",
            "output_image": f"http://127.0.0.1:8000/outputs/{output_file_name}",
            "tumor_volume": f"{tumor_voxels} mm³",
        }
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception as e:
        print("Prediction error:", repr(e))
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Prediction failed: {str(e)}"})
    finally:
        for upload_file in (t1c, t1n, t2f, t2w):
            try:
                upload_file.file.close()
            except Exception:
                pass

@app.get("/")
def root():
    return {"message": "Backend running", "version": "2.0.0"}
