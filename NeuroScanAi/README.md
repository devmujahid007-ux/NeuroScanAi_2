# NeuroScanAI

A comprehensive web application for brain tumor and Alzheimer's disease detection using MRI scans. Built with FastAPI backend and React frontend.

## Features

- User authentication (Patient, Doctor, Admin roles)
- MRI scan upload and analysis
- AI-powered tumor and Alzheimer's detection
- Dashboard for different user roles
- Real-time analysis results
- Secure file handling

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - Database ORM
- **MySQL** - Database
- **JWT** - Authentication
- **Werkzeug** - Password hashing
- **Pydantic** - Data validation

### Frontend
- **React** - UI framework
- **React Router** - Client-side routing
- **Tailwind CSS** - Styling
- **Axios** - HTTP client

## Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- MySQL 8.0+

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd NeuroScanAI
   ```

2. **Setup environment**
   ```bash
   # Copy environment file
   cp backend/.env.example backend/.env

   # Edit .env with your database credentials
   # MYSQL_USER=your_user
   # MYSQL_PASSWORD=your_password
   # MYSQL_HOST=localhost
   # MYSQL_PORT=3306
   # MYSQL_DB=neuroscan_db
   ```

3. **Start the application**
   ```bash
   python start.py --setup  # First time only
   python start.py          # Start both frontend and backend
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

## Project Structure

```
NeuroScanAI/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── routers/        # API endpoints
│   │   ├── models/         # Database models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── security/       # JWT authentication
│   │   └── database/       # Database configuration
│   ├── uploads/            # Uploaded files
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   └── Tumer-Alzheimer-Detection/
│       └── t-a-det/
│           ├── src/
│           │   ├── components/
│           │   ├── pages/
│           │   └── api.js
│           └── package.json
├── ui_snapshots/          # UI mockups
└── start.py               # Startup script
```

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get current user info

### Patients
- `GET /api/patients/` - List patients
- `POST /api/patients/` - Create patient
- `GET /api/patients/{id}` - Get patient details

### Analyses
- `POST /api/analyses/run` - Run analysis on scan
- `GET /api/analyses/{id}` - Get analysis result

## Development

### Backend Development
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend Development
```bash
cd frontend/Tumer-Alzheimer-Detection/t-a-det
npm install
npm start
```

## Database Setup

1. Create MySQL database
2. Run table creation script:
   ```bash
   cd backend
   python create_tables.py
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or issues, please open an issue on GitHub.