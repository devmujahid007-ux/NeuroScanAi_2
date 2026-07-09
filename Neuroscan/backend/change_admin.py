#!/usr/bin/env python3
"""
Change Admin Email and Password
Run: python change_admin.py
"""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.database.db import SessionLocal
from app.models.user import User
from werkzeug.security import generate_password_hash

def main():
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("Change Admin Email and Password")
        print("=" * 70)
        print()
        
        # Show existing admins
        print("[1] Existing Admin Accounts:")
        print("-" * 70)
        admins = db.query(User).filter((User.role == 'admin') | (User.role == 'superadmin')).all()
        
        if not admins:
            print("❌ No admin accounts found in database!")
            print()
            print("To create one, set environment variables and run:")
            print("  set SUPERADMIN_EMAIL=admin@example.com")
            print("  set SUPERADMIN_PASSWORD=password123")
            print("  python ../create_tables.py")
            return 1
        
        for i, admin in enumerate(admins, 1):
            print(f"{i}. Email: {admin.email} | Role: {admin.role}")
        
        print()
        
        # Select which admin to update
        if len(admins) == 1:
            selected_admin = admins[0]
            print(f"Selected: {selected_admin.email} ({selected_admin.role})")
        else:
            choice = input(f"Select admin to modify (1-{len(admins)}): ").strip()
            try:
                selected_admin = admins[int(choice) - 1]
            except (ValueError, IndexError):
                print("❌ Invalid selection")
                return 1
        
        print()
        print("[2] Enter New Credentials:")
        print("-" * 70)
        
        # Get new email
        new_email = input(f"New email (current: {selected_admin.email}): ").strip()
        if not new_email:
            new_email = selected_admin.email
            print(f"(keeping current: {new_email})")
        
        # Check if email already exists
        if new_email != selected_admin.email:
            existing = db.query(User).filter(User.email == new_email).first()
            if existing:
                print(f"❌ Email {new_email} already in use!")
                return 1
        
        # Get new password
        new_password = input("New password: ").strip()
        if not new_password:
            print("❌ Password cannot be empty")
            return 1
        
        confirm_password = input("Confirm password: ").strip()
        if new_password != confirm_password:
            print("❌ Passwords do not match!")
            return 1
        
        # Update admin
        print()
        print("[3] Updating Admin...")
        print("-" * 70)
        
        selected_admin.email = new_email
        selected_admin.password = generate_password_hash(new_password)
        
        db.commit()
        
        print("✓ Admin credentials updated successfully!")
        print()
        print("New Login Credentials:")
        print(f"  Email: {selected_admin.email}")
        print(f"  Password: {'*' * len(new_password)} (don't share this)")
        print()
        print("=" * 70)
        
        return 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        return 1
    finally:
        db.close()

if __name__ == "__main__":
    sys.exit(main())
