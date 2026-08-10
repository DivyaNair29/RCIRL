#!/usr/bin/env python3
"""
One-command local launcher for RCIRL.

Starts:
  - the PHP property app on http://localhost:8000  (PHP must be installed)
  - the Python AI service on http://localhost:8001  (FastAPI/uvicorn)

Then opens your browser to the app. Press Ctrl+C to stop both.

First time setup:
  1. Install PHP (with sqlite3, xml, mbstring extensions — these ship with
     any normal PHP install / XAMPP / MAMP).
  2. cd python-service && pip install -r requirements.txt
  3. python run_local.py        <- this script, run from the project root

If property_data/property_manager.db doesn't exist yet, this script runs
the one-time xlsx -> SQLite migration automatically before starting.
"""
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PHP_APP_DIR = ROOT / "php-app"
PY_SERVICE_DIR = ROOT / "python-service"
PHP_PORT = 8000
PY_PORT = 8001


def check_php():
    if not shutil.which("php"):
        print("ERROR: PHP is not installed or not on your PATH.")
        print("Install PHP (php.net, or XAMPP/MAMP which bundle it) and try again.")
        sys.exit(1)


def ensure_database():
    db_path = PHP_APP_DIR / "property_data" / "property_manager.db"
    if db_path.exists():
        return
    print("No database found yet — running one-time xlsx -> SQLite migration...")
    result = subprocess.run(
        ["php", "migrate_xlsx_to_sqlite.php"], cwd=PHP_APP_DIR
    )
    if result.returncode != 0:
        print("Migration failed — check the error above.")
        sys.exit(1)


def main():
    check_php()
    ensure_database()

    print(f"Starting PHP app on http://localhost:{PHP_PORT} ...")
    php_proc = subprocess.Popen(
        ["php", "-S", f"127.0.0.1:{PHP_PORT}", "-t", "."],
        cwd=PHP_APP_DIR,
    )

    print(f"Starting Python AI service on http://localhost:{PY_PORT} ...")
    env = os.environ.copy()
    py_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PY_PORT)],
        cwd=PY_SERVICE_DIR,
        env=env,
    )

    time.sleep(2)
    webbrowser.open(f"http://localhost:{PHP_PORT}")

    print()
    print(f"  Property app:  http://localhost:{PHP_PORT}")
    print(f"  AI service:    http://localhost:{PY_PORT}  (docs at /docs)")
    print()
    print("Press Ctrl+C to stop both.")

    try:
        while True:
            time.sleep(1)
            if php_proc.poll() is not None:
                print("PHP server stopped unexpectedly.")
                break
            if py_proc.poll() is not None:
                print("Python service stopped unexpectedly.")
                break
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        for p in (php_proc, py_proc):
            if p.poll() is None:
                p.terminate()
        for p in (php_proc, py_proc):
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
