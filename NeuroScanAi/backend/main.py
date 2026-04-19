import os
import shutil
import traceback
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from app.database.db import init_db
from app.routers import auth, upload, users, analyses, stats, patients, mri_preview, reports_pdf
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.model_loader import load_model
from app.preprocessing import load_mri_images, preprocess
from app.inference import predict_segmentation_with_confidence
from app.visualization import save_overlay

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    yield
    # Shutdown

app = FastAPI(title="TAD Backend", version="2.0.0", lifespan=lifespan)


class AllowPrivateNetworkMiddleware(BaseHTTPMiddleware):
    """Chrome: http://localhost (React or Flutter web) may need this to reach LAN APIs."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


# JWT uses Authorization headers (not cookies). Wildcard CORS lets React (3000), Flutter
# web (random port), and mobile/LAN clients call the same API without listing every origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
    expose_headers=["X-Report-Id", "X-Report-File-Url"],
)
app.add_middleware(AllowPrivateNetworkMiddleware)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(mri_preview.router)
app.include_router(users.router)
app.include_router(analyses.router)
app.include_router(analyses.api_router)
app.include_router(analyses.core_router)
app.include_router(stats.router)
app.include_router(patients.router)
app.include_router(reports_pdf.router)

REPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "reports"))
os.makedirs(REPORTS_DIR, exist_ok=True)

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
        seg, conf_pct = predict_segmentation_with_confidence(model, image, device)

        output_file_name = f"result_{uuid4().hex}.png"
        output_path = os.path.join(OUTPUT_DIR, output_file_name)
        save_overlay(vis_image, seg, output_path)

        seg_arr = np.asarray(seg)
        tumor_voxels = int(np.count_nonzero(seg_arr > 0))
        uniq, cnts = np.unique(seg_arr, return_counts=True)
        label_counts = {str(int(u)): int(c) for u, c in zip(uniq, cnts)}
        return {
            "message": "Tumor Detected" if tumor_voxels > 0 else "No Tumor Detected",
            "output_image": f"/outputs/{output_file_name}",
            "tumor_volume": f"{tumor_voxels} positive mask voxels",
            "confidence": float(conf_pct) if np.isfinite(conf_pct) else None,
            "model_version": "MONAI BraTS SegResNet (3D sliding-window, same weights as clinic PDF pipeline)",
            "probs": label_counts,
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

@app.post("/alz_predict")
async def alz_predict_api(image: UploadFile = File(..., description="PNG or JPEG brain MRI image")):
    """
    Standalone Alzheimer image inference (separate from tumor ``/predict`` ZIP/NIfTI pipeline).
    Loads ``alz_model_accurate.pth`` once (cached inside ``app.ml.alzheimer_inference``).
    """
    from app.ml.alzheimer_inference import predict_alzheimer_from_image_path

    lower = (image.filename or "").lower()
    allowed = (".png", ".jpg", ".jpeg")
    if not any(lower.endswith(ext) for ext in allowed):
        return JSONResponse(
            status_code=400,
            content={"error": "Expected image file: .png, .jpg, or .jpeg"},
        )
    ext = ".png"
    if lower.endswith(".jpeg"):
        ext = ".jpeg"
    elif lower.endswith(".jpg"):
        ext = ".jpg"

    tmp = os.path.join(TEMP_UPLOAD_DIR, f"alz_{uuid4().hex}{ext}")
    try:
        with open(tmp, "wb") as out:
            shutil.copyfileobj(image.file, out)
        out = predict_alzheimer_from_image_path(tmp)
        return {
            "prediction": out["prediction"],
            "confidence": out["confidence"],
            "probs": out["probs"],
            "model_version": out["model_version"],
            "num_classes": out.get("num_classes"),
        }
    except RuntimeError as e:
        return JSONResponse(status_code=503, content={"error": str(e)})
    except Exception as e:
        print("Alzheimer prediction error:", repr(e))
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Alzheimer prediction failed: {str(e)}"})
    finally:
        try:
            image.file.close()
        except Exception:
            pass
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except Exception:
            pass


@app.get("/")
def root():
    return {"message": "Backend running", "version": "2.0.0"}
