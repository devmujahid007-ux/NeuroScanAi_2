#!/usr/bin/env python3
"""
NeuroScanAI - Start Frontend + Backend with one command
Run: python start.py
"""

import subprocess
import time
import sys
import os
import shlex
from pathlib import Path

def kill_process_on_port(port):
    """Kill any process running on the specified port"""
    try:
        if sys.platform == "win32":
            # Find PID using netstat
            result = subprocess.run(
                ["netstat", "-ano"], 
                capture_output=True, 
                text=True, 
                timeout=10
            )
            for line in result.stdout.split('\n'):
                if f':{port}' in line and 'LISTENING' in line:
                    parts = line.split()
                    if len(parts) >= 5:
                        pid = parts[-1]
                        try:
                            subprocess.run(["taskkill", "/PID", pid, "/F"], 
                                         capture_output=True, timeout=5)
                            print(f"[OK] Killed process {pid} on port {port}")
                        except:
                            pass
        else:
            # For Linux/Mac, use lsof and kill
            try:
                result = subprocess.run(
                    ["lsof", "-ti", f":{port}"], 
                    capture_output=True, 
                    text=True, 
                    timeout=5
                )
                if result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        subprocess.run(["kill", "-9", pid], 
                                     capture_output=True, timeout=5)
                        print(f"[OK] Killed process {pid} on port {port}")
            except:
                pass
    except:
        pass

def run_command(cmd, cwd=None):
    """Run a command and return the process"""
    return subprocess.Popen(cmd, shell=True, cwd=cwd)

def main():
    root_dir = Path(__file__).parent.resolve()
    backend_dir = root_dir / "backend"
    frontend_dir = root_dir / "frontend" / "Tumer-Alzheimer-Detection" / "t-a-det"
    
    print("=" * 70)
    print("NeuroScanAI - Starting Frontend + Backend")
    print("=" * 70)
    print()
    
    # Check prerequisites
    print("[1] Checking prerequisites...")
    
    if not (backend_dir / "venv").exists():
        print("[ERROR] Backend virtual environment not found")
        print("   Run: python start.py --setup")
        return 1
    
    if not (frontend_dir / "node_modules").exists():
        print("[ERROR] Frontend node_modules not found")
        print("   Run: python start.py --setup")
        return 1
    
    print("[OK] All prerequisites found")
    print()
    
    # Kill any existing processes on the ports
    print("[1.5] Cleaning up previous processes...")
    kill_process_on_port(8000)
    kill_process_on_port(3000)
    time.sleep(1)
    print("[OK] Ports cleared")
    print()
    
    # Start backend
    print("[2] Starting Backend on http://localhost:8000...")
    if sys.platform == "win32":
        backend_python = backend_dir / "venv" / "Scripts" / "python.exe"
        backend_process = subprocess.Popen(
            [
                str(backend_python),
                "-m",
                "uvicorn",
                "main:app",
                "--reload",
                "--host",
                "0.0.0.0",
                "--port",
                "8000",
            ],
            cwd=str(backend_dir),
        )
    else:
        quoted = shlex.quote(str(backend_dir.resolve()))
        backend_process = subprocess.Popen(
            [
                "bash",
                "-lc",
                f"cd {quoted} && source venv/bin/activate && "
                "python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000",
            ],
            cwd=str(backend_dir),
        )
    
    time.sleep(3)
    print("[OK] Backend started")
    print()
    
    # Start frontend
    print("[3] Starting Frontend on http://localhost:3000...")
    if sys.platform == "win32":
        react_scripts = frontend_dir / "node_modules" / "react-scripts" / "bin" / "react-scripts.js"
        frontend_process = subprocess.Popen(
            ["node", str(react_scripts), "start"],
            cwd=str(frontend_dir),
            env={**os.environ, "PORT": "3000"}
        )
    else:
        frontend_process = subprocess.Popen(
            ["npm", "start"],
            cwd=str(frontend_dir),
            env={**os.environ, "PORT": "3000"}
        )
    
    print("[OK] Frontend started")
    print()
    
    print("=" * 70)
    print("[OK] Both services are running CONCURRENTLY!")
    print()
    print("  Frontend: http://localhost:3000")
    print("  Backend:  http://localhost:8000")
    print()
    print("Backend output:")
    print("-" * 70)
    print()
    
    try:
        backend_process.wait()
        frontend_process.wait()
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        backend_process.terminate()
        frontend_process.terminate()
        backend_process.wait(timeout=5)
        frontend_process.wait(timeout=5)
        print("[OK] All services stopped")
        return 0

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--setup":
        print("Running setup...")
        if sys.platform == "win32":
            os.system(f'cd /d "{Path(__file__).parent}" && cmd /c "cd backend && python -m venv venv && venv\\Scripts\\activate && pip install -r requirements.txt && cd .. && cd frontend\\Tumer-Alzheimer-Detection\\t-a-det && npm install"')
        else:
            os.system(f'cd "{Path(__file__).parent}" && cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && cd ../frontend/Tumer-Alzheimer-Detection/t-a-det && npm install')
        print("[OK] Setup complete! Now run: python start.py")
    else:
        sys.exit(main())
