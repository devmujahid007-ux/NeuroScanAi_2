# NeuroScanAI

NeuroScanAI is a full-stack web application designed to support the analysis of brain MRI scans for Alzheimer’s disease and brain tumor detection. The platform combines a FastAPI backend, a React frontend, and AI-based inference workflows to help users upload scans, review results, and generate reports in a structured medical dashboard experience.

> This project is intended for academic and research-oriented use and should not be treated as a substitute for professional medical diagnosis.

## Features

- Secure authentication and role-based access for patients, doctors, admins, and superadmins
- MRI upload and preview workflow for medical image analysis
- AI-assisted inference for Alzheimer’s and tumor-related analysis
- Report generation and result storage for review and follow-up
- Interactive API documentation via Swagger UI

## Tech Stack

- Backend: FastAPI, SQLAlchemy, Pydantic, PyMySQL, JWT, Werkzeug
- Frontend: React, React Router, Tailwind CSS, Axios
- Database: MySQL 8+
- ML/Processing: PyTorch, OpenCV, NumPy, Pillow, SciPy, nibabel

## AI Models Used

This project uses two main AI models for medical image analysis:

- Tumor segmentation model: MONAI BraTS SegResNet-based segmentation pipeline, loaded from the bundled model directory under [backend/models/brats_model/brats_mri_segmentation](backend/models/brats_model/brats_mri_segmentation)
- Alzheimer classification model: a ResNet-based classifier using the checkpoint file named alz_model_accurate.pth, which is used for 4-class Alzheimer stage prediction

These model files are expected to be available locally for inference. If they are missing, the analysis endpoints will not work properly until the appropriate model weights are added.

## Project Structure

```text
NeuroScanAI/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── security/
│   │   └── database/
│   ├── main.py
│   ├── create_tables.py
│   ├── change_admin.py
│   └── requirements.txt
├── frontend/
│   └── Tumer-Alzheimer-Detection/
│       └── t-a-det/
├── start.py
└── README.md
```

## Prerequisites

Before running the project, make sure you have:

- Python 3.9+ or 3.10+
- Node.js 16+ and npm
- MySQL 8.0+ running locally or on a server

## Installation and Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd NeuroScanAI
```

### 2. Configure environment variables

Create a local environment file for the backend:

```bash
copy backend\.env.example backend\.env
```

Update the values in backend/.env to match your local MySQL configuration:

```env
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=tumer_db

JWT_SECRET=change_me_dev_secret
JWT_EXPIRE_MINUTES=120
```

Create the database in MySQL:

```sql
CREATE DATABASE tumer_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Install dependencies

Run the setup script from the project root:

```bash
python start.py --setup
```

This will create the backend virtual environment, install Python dependencies, and install frontend packages.

### 4. Create database tables and initial admin account

You can initialize the database and create a superadmin account using:

```bash
cd backend
venv\Scripts\python.exe create_tables.py
```

If you are using a development environment and want sample users, you can also run:

```bash
python create_test_users.py
```

## Running the Application

### Start both frontend and backend

From the project root:

```bash
python start.py
```

The application will be available at:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Run each service separately

Backend:

```bash
cd backend
venv\Scripts\activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend/Tumer-Alzheimer-Detection/t-a-det
npm start
```

## API Overview

Once the backend is running, Swagger UI can be accessed at:

```text
http://localhost:8000/docs
```

Key API areas include authentication, user management, patient workflows, analysis endpoints, MRI-related routes, and report generation.

## Notes

- Keep backend/.env private and do not commit it to GitHub.
- The project uses local storage paths and uploaded files under the backend data directories.
- For production deployment, review security settings, secrets management, and database configuration carefully.

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository
2. Create a new feature branch
3. Make your changes
4. Submit a pull request with a clear description

## License

A license file has not been added yet. If you plan to publish this repository publicly, consider adding an appropriate open-source license such as MIT or Apache 2.0.

## Contact

If you have questions or would like to collaborate, please open an issue or contact the repository maintainer.
