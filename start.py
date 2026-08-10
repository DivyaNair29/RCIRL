"""
Railway start script — starts PHP + Python services behind a reverse proxy.
On first boot, copies xlsx seed files to the /data volume.
"""
import os
import shutil
import subprocess
import sys
import time
import socket
from pathlib import Path

PORT    = int(os.environ.get("PORT", 8080))
PHP_PORT = 8000
PY_PORT  = 8001
IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))
ROOT = Path(__file__).parent

def log(msg):
    print(f"[start] {msg}", flush=True)

def run(cmd, cwd=None):
    return subprocess.Popen(cmd, cwd=str(cwd) if cwd else None,
                            env=os.environ.copy(),
                            stdout=sys.stdout, stderr=sys.stderr)

def wait_port(port, timeout=45):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    return False

# ── On Railway: seed /data with xlsx files and settings on first boot ──────
if IS_RAILWAY:
    data_dir = Path("/data/property_data")
    data_dir.mkdir(parents=True, exist_ok=True)
    Path("/data/uploads").mkdir(parents=True, exist_ok=True)
    Path("/data/outputs").mkdir(parents=True, exist_ok=True)

    src_data = ROOT / "php-app" / "property_data"
    for f in src_data.glob("*.xlsx"):
        dst = data_dir / f.name
        if not dst.exists():
            shutil.copy2(f, dst)
            log(f"Seeded {f.name} → /data/property_data/")

    for f in ["settings.json", "categories.json"]:
        src = src_data / f
        dst = data_dir / f
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
            log(f"Seeded {f}")

    # Copy logo asset
    logo_src = ROOT / "python-service" / "app" / "assets" / "rcirl_logo.png"
    logo_dst = Path("/data/assets/rcirl_logo.png")
    if logo_src.exists() and not logo_dst.exists():
        logo_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(logo_src, logo_dst)
        log("Seeded rcirl_logo.png")

    # Run xlsx → SQLite migration if database is empty or missing
    db_path = data_dir / "property_manager.db"
    xlsx_files = list((ROOT / "php-app" / "property_data").glob("*.xlsx"))
    needs_migration = not db_path.exists() or db_path.stat().st_size < 8192

    if needs_migration and xlsx_files:
        log("Running xlsx → SQLite migration...")
        # The migration script uses DATA_DIR relative to php-app — set env so it finds /data
        migrate_env = {
            **os.environ,
            "RAILWAY_ENVIRONMENT": "production",   # makes api.php use /data paths
        }
        result = subprocess.run(
            ["php", "migrate_xlsx_to_sqlite.php"],
            cwd=str(ROOT / "php-app"),
            env=migrate_env,
            capture_output=True,
            text=True,
            timeout=120,
        )
        log(f"Migration stdout: {result.stdout.strip()}")
        if result.returncode != 0:
            log(f"Migration stderr: {result.stderr.strip()}")
        else:
            log("Migration complete — database ready")
    elif db_path.exists():
        log(f"Database exists ({db_path.stat().st_size} bytes) — skipping migration")

log(f"Starting services (Railway={IS_RAILWAY}, PORT={PORT})")

# ── Start PHP ──────────────────────────────────────────────────────────────
php_proc = run(["php", "-S", f"0.0.0.0:{PHP_PORT}", "-t", "."],
               cwd=ROOT / "php-app")
log(f"PHP started on {PHP_PORT} (pid {php_proc.pid})")

# ── Start Python FastAPI ───────────────────────────────────────────────────
py_proc = run([sys.executable, "-m", "uvicorn", "app.main:app",
               "--host", "0.0.0.0", "--port", str(PY_PORT)],
              cwd=ROOT / "python-service")
log(f"Python service started on {PY_PORT} (pid {py_proc.pid})")

# ── Wait for both to be ready ──────────────────────────────────────────────
wait_port(PHP_PORT) and log("PHP ready")
wait_port(PY_PORT)  and log("Python ready")

# ── Reverse proxy on $PORT ────────────────────────────────────────────────
# Routes /generate, /files, /canva, /chat, /properties, /xlsx → Python (PY_PORT)
# Everything else → PHP (PHP_PORT)
PYTHON_PREFIXES = ('/generate', '/files', '/canva', '/chat',
                   '/properties', '/xlsx', '/api/ai')

proxy_code = f"""
import http.server, urllib.request, socket

PYTHON_PREFIXES = {PYTHON_PREFIXES!r}
PHP_PORT = {PHP_PORT}
PY_PORT  = {PY_PORT}

class P(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle_req(self):
        port = PY_PORT if any(self.path.startswith(p) for p in PYTHON_PREFIXES) else PHP_PORT
        url  = f'http://127.0.0.1:{{port}}{{self.path}}'
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        hdrs = {{k: v for k, v in self.headers.items()
                 if k.lower() not in ('host', 'content-length', 'transfer-encoding')}}
        try:
            req = urllib.request.Request(url, data=body or None,
                                         headers=hdrs, method=self.command)
            with urllib.request.urlopen(req, timeout=120) as r:
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() != 'transfer-encoding':
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(r.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())
    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = handle_req

http.server.HTTPServer(('0.0.0.0', {PORT}), P).serve_forever()
"""

proxy = subprocess.Popen([sys.executable, "-c", proxy_code],
                         stdout=sys.stdout, stderr=sys.stderr)
log(f"Proxy started on {PORT} (pid {proxy.pid})")

# ── Watchdog ───────────────────────────────────────────────────────────────
while True:
    time.sleep(5)
    if php_proc.poll() is not None:
        log("PHP crashed — restarting")
        php_proc = run(["php", "-S", f"0.0.0.0:{PHP_PORT}", "-t", "."],
                       cwd=ROOT / "php-app")
    if py_proc.poll() is not None:
        log("Python crashed — restarting")
        py_proc = run([sys.executable, "-m", "uvicorn", "app.main:app",
                       "--host", "0.0.0.0", "--port", str(PY_PORT)],
                      cwd=ROOT / "python-service")
    if proxy.poll() is not None:
        log("Proxy crashed — restarting")
        proxy = subprocess.Popen([sys.executable, "-c", proxy_code],
                                 stdout=sys.stdout, stderr=sys.stderr)