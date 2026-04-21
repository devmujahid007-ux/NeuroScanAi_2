# NeuroScanAI

A web application for brain tumor and Alzheimer’s disease assistance from MRI scans: upload, AI-backed analysis, and role-based dashboards. The stack is a **FastAPI** backend with **MySQL**, and a **React** frontend.

## Features

- **Authentication** — JWT-based login; roles: patient, doctor, admin, and superadmin
- **MRI workflow** — Uploads, previews, analysis (tumor segmentation / Alzheimer’s path), stored results and reports
- **Dashboards** — Different views per role (patients, doctors, admins)
- **API docs** — Interactive OpenAPI UI at `/docs` when the backend is running

## Tech stack

| Layer | Technologies |
|--------|----------------|
| Backend | FastAPI, SQLAlchemy, Pydantic, PyMySQL, Werkzeug (password hashes), JWT |
| Database | MySQL 8+ |
| Frontend | React, React Router, Tailwind CSS, Axios |
| ML | Loaded models for inference (see `backend/app` — model loader, preprocessing, inference) |

## Prerequisites

- **Python** 3.8+
- **Node.js** 16+ and npm
- **MySQL** 8.0+ (server running and a database you can use)

## How to run the project

### 1. Clone and enter the project

```bash
git clone <your-repo-url>
cd NeuroScanAI
```

On Windows, paths are the same in PowerShell or Command Prompt; use `copy` instead of `cp` where noted below.

### 2. Configure environment

Copy the example env file and edit **`backend/.env`**:

```bash
# Linux / macOS
cp backend/.env.example backend/.env
```

```powershell
# Windows (Command Prompt or PowerShell)
copy backend\.env.example backend\.env
```

Set at least:

| Variable | Purpose |
|----------|---------|
| `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_PORT` | MySQL connection |
| `MYSQL_DB` | Database name (example file uses `tumer_db`) |
| `JWT_SECRET`, `JWT_EXPIRE_MINUTES` | Signing tokens for login |

Optional: `SMTP_*` and `CONTACT_RECEIVER_EMAIL` if you use contact/email features.

Create the MySQL database once (name must match `MYSQL_DB`):

```sql
CREATE DATABASE tumer_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. First-time install (venv + Python deps + npm)

From the **repository root** (folder that contains `start.py`):

```bash
python start.py --setup
```

This creates `backend/venv`, installs `backend/requirements.txt`, and runs `npm install` in `frontend/Tumer-Alzheimer-Detection/t-a-det`.

### 4. Create tables and a privileged user (first run)

The public **register** API cannot create admin or superadmin accounts. You need **either**:

**A — Superadmin via `create_tables.py` (recommended for production-style bootstrap)**  

Add to **`backend/.env`**:

```env
SUPERADMIN_EMAIL=you@example.com
SUPERADMIN_PASSWORD=your-secure-password
```

Then:

```bash
cd backend
# Windows:
venv\Scripts\python.exe create_tables.py
# Linux / macOS:
source venv/bin/activate && python create_tables.py
```

You should see `Created superadmin ...`. Log in on the app with that email and password.

**B — Dev test users (includes `admin` role)**  

From the **repository root**:

```bash
python create_test_users.py
```

Example seeded admin: `admin@neuroscan.com` / `admin123` (development only; change for any shared environment).

**C — Change an existing admin’s password**  

```bash
cd backend
venv\Scripts\python.exe change_admin.py
```

(interactive; requires at least one admin or superadmin already in the database.)

### 5. Start backend and frontend together

From the **repository root**:

```bash
python start.py
```

- **Frontend:** http://localhost:3000  
- **Backend API:** http://localhost:8000  
- **Swagger UI:** http://localhost:8000/docs  

Stop with `Ctrl+C` in the same terminal.

### 6. Run backend or frontend alone (optional)

**Backend**

```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**

```bash
cd frontend/Tumer-Alzheimer-Detection/t-a-det
npm install
npm start
```

## How the project works (basics)

1. **Configuration** — `backend/.env` drives MySQL, JWT, and optional SMTP. `app/database/db.py` loads it with `python-dotenv`.

2. **Startup** — `python start.py` launches Uvicorn on port **8000** and the React dev server on **3000**. The FastAPI app (`main.py`) registers routers for auth, uploads, analyses, patients, reports, etc., enables CORS for the SPA, and runs `init_db()` on startup for safe schema tweaks.

3. **Auth** — Users register (patient/doctor only) or log in. The API returns a **JWT**; the frontend sends `Authorization: Bearer <token>` on protected calls. Roles are stored on the `users` table and embedded in the token payload.

4. **Data** — SQLAlchemy models map to MySQL tables (users, MRI scans, diagnoses, reports, etc.). Uploaded files and generated artifacts live under backend data/upload paths (see `main.py` and `uploads/`).

5. **Analysis** — MRI uploads go through preprocessing; models produce predictions/overlays; results and metadata are persisted and exposed via API routes under `/api/...` and related prefixes.

6. **Frontend** — React routes send users to role-appropriate pages after login; `src/api.js` centralizes HTTP calls to the backend.

High-level flow:

```text
Browser (React)  --HTTPS/JSON-->  FastAPI  <-->  MySQL
                                    |
                            ML inference / file storage
```

## Project structure

```text
NeuroScanAI/
├── backend/
│   ├── main.py                 # FastAPI app entry
│   ├── create_tables.py        # Tables + optional superadmin (env vars)
│   ├── change_admin.py         # Reset admin/superadmin password (interactive)
│   ├── app/
│   │   ├── routers/            # auth, patients, analyses, upload, ...
│   │   ├── models/, schemas/
│   │   ├── security/           # JWT
│   │   └── database/           # engine, init_db
│   ├── requirements.txt
│   └── .env                    # local secrets (not committed)
├── frontend/Tumer-Alzheimer-Detection/t-a-det/   # React app
├── create_test_users.py        # Seed dev users (admin/doctor/patient)
├── start.py                    # --setup and concurrent dev servers
└── ui_snapshots/
```

## API overview

Interactive documentation: **http://localhost:8000/docs** when the server is running.

| Area | Prefix / examples |
|------|-------------------|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Users | `/users/...` |
| Patients | `/api/patients/...` |
| Analyses | `/api/analyses/...`, related `/api/...` routes |
| MRI | `/mri/...` |
| Report PDFs | `/reports/...` |

Superadmin-only: `POST /auth/create-admin` (creates an **admin** user; not available from public registration.)

## Development notes

- Use **`create_tables.py`** after changing models or on a fresh database before relying on the app.
- Keep **`backend/.env`** out of version control and rotate secrets if the repo is shared.
- Default DB name in `.env.example` is **`tumer_db`**; align `MYSQL_DB` with the database you created in MySQL.

## Contributing

1. Fork the repository  
2. Create a feature branch  
3. Make your changes  
4. Add tests if applicable  
5. Open a pull request  

## License

This project is licensed under the MIT License — see the LICENSE file for details.

## Support

For questions or issues, open an issue on GitHub.
