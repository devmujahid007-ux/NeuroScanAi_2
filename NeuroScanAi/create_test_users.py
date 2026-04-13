#!/usr/bin/env python3
"""
Create test users for NeuroScanAI
Run: python create_test_users.py
"""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.database.db import SessionLocal
from app.models.user import User
from werkzeug.security import generate_password_hash

def create_test_users():
    db = SessionLocal()

    try:
        print("Creating test users...")

        # Test users data
        test_users = [
            {
                "email": "admin@neuroscan.com",
                "password": "admin123",
                "role": "admin"
            },
            {
                "email": "doctor@neuroscan.com",
                "password": "doctor123",
                "role": "doctor"
            },
            {
                "email": "patient@neuroscan.com",
                "password": "patient123",
                "role": "patient"
            }
        ]

        created_count = 0
        for user_data in test_users:
            # Check if user already exists
            existing = db.query(User).filter(User.email == user_data["email"]).first()
            if existing:
                print(f"✓ User {user_data['email']} already exists")
                continue

            # Create new user
            hashed_password = generate_password_hash(user_data["password"])
            user = User(
                email=user_data["email"],
                password=hashed_password,
                role=user_data["role"]
            )
            db.add(user)
            print(f"✓ Created {user_data['role']}: {user_data['email']} (password: {user_data['password']})")
            created_count += 1

        db.commit()
        print(f"\n✅ Created {created_count} test users successfully!")

        print("\n📋 Test Accounts:")
        print("=" * 50)
        for user_data in test_users:
            print(f"Role: {user_data['role'].title()}")
            print(f"Email: {user_data['email']}")
            print(f"Password: {user_data['password']}")
            print("-" * 30)

    except Exception as e:
        print(f"❌ Error creating test users: {e}")
        db.rollback()
        return 1
    finally:
        db.close()

    return 0

if __name__ == "__main__":
    sys.exit(create_test_users())