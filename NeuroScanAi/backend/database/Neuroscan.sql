CREATE DATABASE tumer_db;
CREATE DATABASE neuroscanai;
USE neuroscanai;

-- ==============================
-- USERS TABLE
-- ==============================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','doctor','patient') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================
-- MRI SCANS TABLE
-- ==============================
CREATE TABLE mri_scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================
-- DIAGNOSIS TABLE
-- ==============================
CREATE TABLE diagnoses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    scan_id INT NOT NULL,
    disease_type ENUM('tumor','alzheimer') NOT NULL,
    prediction VARCHAR(100) NOT NULL,
    confidence FLOAT NOT NULL,
    model_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (scan_id) REFERENCES mri_scans(id) ON DELETE CASCADE
);

-- ==============================
-- REPORTS TABLE
-- ==============================
CREATE TABLE reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    diagnosis_id INT NOT NULL,
    summary TEXT,
    recommendation TEXT,
    pdf_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id) ON DELETE CASCADE
);

-- ==============================
-- MODEL LOGS (OPTIONAL ADVANCED)
-- ==============================
CREATE TABLE model_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_name VARCHAR(100),
    version VARCHAR(50),
    accuracy FLOAT,
    training_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
