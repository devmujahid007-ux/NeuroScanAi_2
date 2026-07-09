-- =============================================================================
-- Tumor vs Alzheimer: logical separation in the database (NO application code change)
-- -----------------------------------------------------------------------------
-- Your project ALREADY stores everything in MySQL:
--   • Scans (ZIP / PNG paths)     → mri_scans.file_path, mri_scans.scan_kind
--   • Results (overlay / images)  → diagnoses.result_image_path, result_payload, …
--   • Reports (PDF paths)         → reports.pdf_path, reports.file_path
--
-- Tumor workflow:   scan_kind = 'mri' (or NULL / legacy default)
-- Alzheimer workflow: scan_kind = 'alzheimer'
--
-- Users, auth, and all existing tables stay as they are.
-- This script only adds VIEWS so you can query “tumor only” vs “alzheimer only”
-- without duplicating data. Files may still live under backend/data/... on disk;
-- the database holds the canonical paths.
--
-- Apply manually (example):
--   mysql -u USER -p tumer_db < tumor_alzheimer_separated_views.sql
--
-- Safe to re-run: drops and recreates views only.
-- =============================================================================

DROP VIEW IF EXISTS v_tumor_reports;
DROP VIEW IF EXISTS v_alzheimer_reports;
DROP VIEW IF EXISTS v_tumor_results;
DROP VIEW IF EXISTS v_alzheimer_results;
DROP VIEW IF EXISTS v_tumor_scans;
DROP VIEW IF EXISTS v_alzheimer_scans;

-- ---------------------------------------------------------------------------
-- SCANS (uploads): tumor = BraTS ZIP / modalities folder on server
-- ---------------------------------------------------------------------------
CREATE VIEW v_tumor_scans AS
SELECT
    s.id AS scan_id,
    s.patient_id,
    s.doctor_id,
    s.file_path AS scan_storage_path,
    s.original_filename,
    s.upload_source,
    s.upload_size_bytes,
    s.scan_kind,
    s.status,
    s.upload_date,
    s.sent_date,
    'tumor' AS workflow_label
FROM mri_scans s
WHERE LOWER(TRIM(COALESCE(s.scan_kind, 'mri'))) <> 'alzheimer';

CREATE VIEW v_alzheimer_scans AS
SELECT
    s.id AS scan_id,
    s.patient_id,
    s.doctor_id,
    s.file_path AS scan_storage_path,
    s.original_filename,
    s.upload_source,
    s.upload_size_bytes,
    s.scan_kind,
    s.status,
    s.upload_date,
    s.sent_date,
    'alzheimer' AS workflow_label
FROM mri_scans s
WHERE LOWER(TRIM(COALESCE(s.scan_kind, ''))) = 'alzheimer';

-- ---------------------------------------------------------------------------
-- RESULTS (model output per diagnosis): images + metrics in diagnoses
-- ---------------------------------------------------------------------------
CREATE VIEW v_tumor_results AS
SELECT
    d.id AS diagnosis_id,
    d.scan_id,
    s.patient_id,
    s.doctor_id,
    d.disease_type,
    d.prediction,
    d.confidence,
    d.model_version,
    d.result_image_path AS result_image_path_or_url,
    d.analyzed_at,
    d.model_meta,
    d.result_payload,
    'tumor' AS workflow_label
FROM diagnoses d
INNER JOIN mri_scans s ON s.id = d.scan_id
WHERE LOWER(TRIM(COALESCE(s.scan_kind, 'mri'))) <> 'alzheimer';

CREATE VIEW v_alzheimer_results AS
SELECT
    d.id AS diagnosis_id,
    d.scan_id,
    s.patient_id,
    s.doctor_id,
    d.disease_type,
    d.prediction,
    d.confidence,
    d.model_version,
    d.result_image_path AS result_image_path_or_url,
    d.analyzed_at,
    d.model_meta,
    d.result_payload,
    'alzheimer' AS workflow_label
FROM diagnoses d
INNER JOIN mri_scans s ON s.id = d.scan_id
WHERE LOWER(TRIM(COALESCE(s.scan_kind, ''))) = 'alzheimer';

-- ---------------------------------------------------------------------------
-- REPORTS (PDF + text): linked via diagnosis → scan (same split by scan_kind)
-- ---------------------------------------------------------------------------
CREATE VIEW v_tumor_reports AS
SELECT
    r.id AS report_id,
    r.diagnosis_id,
    d.scan_id,
    r.patient_id,
    r.doctor_id,
    r.pdf_path,
    r.file_path AS report_file_path,
    r.summary,
    r.recommendation,
    r.created_at,
    r.delivered_at,
    s.scan_kind,
    'tumor' AS workflow_label
FROM reports r
INNER JOIN diagnoses d ON d.id = r.diagnosis_id
INNER JOIN mri_scans s ON s.id = d.scan_id
WHERE LOWER(TRIM(COALESCE(s.scan_kind, 'mri'))) <> 'alzheimer';

CREATE VIEW v_alzheimer_reports AS
SELECT
    r.id AS report_id,
    r.diagnosis_id,
    d.scan_id,
    r.patient_id,
    r.doctor_id,
    r.pdf_path,
    r.file_path AS report_file_path,
    r.summary,
    r.recommendation,
    r.created_at,
    r.delivered_at,
    s.scan_kind,
    'alzheimer' AS workflow_label
FROM reports r
INNER JOIN diagnoses d ON d.id = r.diagnosis_id
INNER JOIN mri_scans s ON s.id = d.scan_id
WHERE LOWER(TRIM(COALESCE(s.scan_kind, ''))) = 'alzheimer';

-- =============================================================================
-- Example queries:
--   SELECT * FROM v_tumor_scans ORDER BY upload_date DESC LIMIT 10;
--   SELECT * FROM v_alzheimer_results ORDER BY analyzed_at DESC LIMIT 10;
--   SELECT * FROM v_tumor_reports ORDER BY created_at DESC LIMIT 10;
-- =============================================================================
