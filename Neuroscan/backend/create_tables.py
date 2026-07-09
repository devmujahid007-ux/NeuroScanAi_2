from app.database.db import Base, engine, init_db
from app.models import user  # noqa: F401
from sqlalchemy.orm import Session
from app.database.db import SessionLocal
from werkzeug.security import generate_password_hash
import os
from app.models.user import User
from app.database.db import engine, Base
from app.models import medical   # import models

print("Creating database tables...")
Base.metadata.create_all(bind=engine)
print("Tables created successfully.")


print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables created successfully!")
print("Applying safe schema updates...")
init_db()
print("Schema updates applied.")

# Optional: create a superadmin user if env vars are set (DEV / ops convenience)
email = os.environ.get("SUPERADMIN_EMAIL")
password = os.environ.get("SUPERADMIN_PASSWORD")
if email and password:
	db: Session = SessionLocal()
	try:
		existing = db.query(User).filter(User.email == email).first()
		if existing:
			print(f"Superadmin {email} already exists (skipping)")
		else:
			hashed = generate_password_hash(password)
			sa = User(email=email, password=hashed, role="superadmin")
			db.add(sa)
			db.commit()
			print(f"Created superadmin {email}")
	finally:
		db.close()
else:
	print("No SUPERADMIN_EMAIL/PASSWORD set — skipping superadmin creation")
