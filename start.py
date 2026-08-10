"""
Railway start script — runs both services in one dyno.
Railway gives one port ($PORT). We:
  - Run PHP app on internal port 8000
  - Run Python FastAPI on internal port 8001
  - Run a tiny reverse proxy on $PORT that routes:
      /api/*  → Python service (8001)
      /*      → PHP app (8000)
"""
import os
import subprocess
import sys
import threading
import time

PORT = int(os.environ.get("PORT", 8080))
PHP_PORT = 8000
PY_PORT  = 8001

def run(cmd, cwd=None, env=None):
    e = {**os.environ, **(env or {})}
    return subprocess.Popen(cmd, cwd=cwd, env=e,
                            stdout=sys.stdout, stderr=sys.stderr)

def wait_for_port(port, timeout=30):
    import socket
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.5)
    return False

print(f"[start] PORT={PORT} PHP={PHP_PORT} PY={PY_PORT}")

# 1. Start PHP app
php_proc = run(
    ["php", "-S", f"0.0.0.0:{PHP_PORT}", "-t", "."],
    cwd="php-app"
)
print(f"[start] PHP started (pid {php_proc.pid})")

# 2. Start Python FastAPI service
py_proc = run(
    [sys.executable, "-m", "uvicorn", "app.main:app",
     "--host", "0.0.0.0", "--port", str(PY_PORT)],
    cwd="python-service"
)
print(f"[start] Python service started (pid {py_proc.pid})")

# 3. Wait for both to be ready
wait_for_port(PHP_PORT)
wait_for_port(PY_PORT)
print("[start] Both services ready")

# 4. Start reverse proxy on $PORT
proxy_script = f"""
import http.server, urllib.request, urllib.error, os

class Proxy(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_request(self):
        target_port = {PY_PORT} if self.path.startswith('/api/') or self.path.startswith('/generate') or self.path.startswith('/files') or self.path.startswith('/canva') or self.path.startswith('/chat') or self.path.startswith('/properties') or self.path.startswith('/xlsx') else {PHP_PORT}
        url = f'http://127.0.0.1:{{target_port}}{{self.path}}'
        try:
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            req  = urllib.request.Request(url, data=body or None,
                                          headers={{k:v for k,v in self.headers.items()
                                                   if k.lower() not in ('host','content-length')}},
                                          method=self.command)
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ('transfer-encoding',):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(resp.read())
        except Exception as e:
            self.send_response(502)
            self.end_headers()
            self.wfile.write(str(e).encode())
    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_request

print(f'[proxy] Listening on {PORT}')
http.server.HTTPServer(('0.0.0.0', {PORT}), Proxy).serve_forever()
"""

proxy_proc = subprocess.Popen(
    [sys.executable, "-c", proxy_script],
    stdout=sys.stdout, stderr=sys.stderr
)
print(f"[start] Proxy started on port {PORT} (pid {proxy_proc.pid})")

# Watch for crashes and restart
while True:
    time.sleep(5)
    if php_proc.poll() is not None:
        print("[start] PHP crashed — restarting")
        php_proc = run(["php", "-S", f"0.0.0.0:{PHP_PORT}", "-t", "."], cwd="php-app")
    if py_proc.poll() is not None:
        print("[start] Python service crashed — restarting")
        py_proc = run([sys.executable, "-m", "uvicorn", "app.main:app",
                       "--host", "0.0.0.0", "--port", str(PY_PORT)], cwd="python-service")
    if proxy_proc.poll() is not None:
        print("[start] Proxy crashed — restarting")
        proxy_proc = subprocess.Popen([sys.executable, "-c", proxy_script],
                                      stdout=sys.stdout, stderr=sys.stderr)
