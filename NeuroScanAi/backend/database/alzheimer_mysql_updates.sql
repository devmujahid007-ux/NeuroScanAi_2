-- =============================================================================
-- Alzheimer data uses the SAME tables as tumor (no separate Alzheimer tables).
--   mri_scans.scan_kind = 'alzheimer'   — upload path, PNG/JPEG under uploads/scans/<id>/
--   diagnoses.disease_type = 'alzheimer' — model output, confidence, JSON meta
--   reports — PDF path (pdf_path / file_path), summary, recommendation
-- =============================================================================
-- Run manually on your MySQL database if you prefer not to rely on init_db():
--   mysql -u USER -p YOUR_DB < alzheimer_mysql_updates.sql
-- Safe to re-run: index creation may error if indexes already exist (ignore or drop first).
-- =============================================================================

-- Longer paths for Windows/Linux absolute paths under uploads/
ALTER TABLE mri_scans MODIFY COLUMN file_path VARCHAR(512) NULL;

CREATE INDEX idx_mri_scans_scan_kind ON mri_scans (scan_kind);
CREATE INDEX idx_mri_scans_doctor_scan_kind ON mri_scans (doctor_id, scan_kind);
CREATE INDEX idx_mri_scans_patient_scan_kind ON mri_scans (patient_id, scan_kind);

CREATE INDEX idx_diagnoses_disease_type ON diagnoses (disease_type);

CREATE INDEX idx_reports_doctor_created ON reports (doctor_id, created_at);
