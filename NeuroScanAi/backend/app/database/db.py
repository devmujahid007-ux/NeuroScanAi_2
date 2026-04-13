import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "password")
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = os.getenv("MYSQL_PORT", "3306")
MYSQL_DB = os.getenv("MYSQL_DB", "tumer_db")

DATABASE_URL = (
    f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}"
)

print("USING DATABASE:", DATABASE_URL)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db():
    """Initialize database tables and add missing columns for legacy databases."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    existing_columns = {col["name"] for col in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "name" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(255) NULL"))
        if "age" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN age INT NULL"))
        if "phone" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50) NULL"))

        if "mri_scans" in table_names:
            mri_columns = {col["name"] for col in inspector.get_columns("mri_scans")}
            if "status" not in mri_columns:
                conn.execute(
                    text(
                        "ALTER TABLE mri_scans "
                        "ADD COLUMN status ENUM('pending','sent','analyzed','reported') "
                        "NOT NULL DEFAULT 'pending'"
                    )
                )
            if "sent_date" not in mri_columns:
                conn.execute(text("ALTER TABLE mri_scans ADD COLUMN sent_date TIMESTAMP NULL"))

        if "reports" in table_names:
            report_columns = {col["name"] for col in inspector.get_columns("reports")}
            if "pdf_path" not in report_columns:
                conn.execute(text("ALTER TABLE reports ADD COLUMN pdf_path VARCHAR(255) NULL"))

        if "diagnoses" in table_names:
            dx_columns = {col["name"] for col in inspector.get_columns("diagnoses")}
            if "model_meta" not in dx_columns:
                conn.execute(text("ALTER TABLE diagnoses ADD COLUMN model_meta TEXT NULL"))
            if "model_version" in dx_columns:
                try:
                    conn.execute(text("ALTER TABLE diagnoses MODIFY COLUMN model_version VARCHAR(255) NULL"))
                except Exception:
                    pass
