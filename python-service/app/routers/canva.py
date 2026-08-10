"""
Canva Connect API integration — OAuth 2.0 + PKCE flow.

Flow:
  1. User clicks "Open in Canva" on a generated poster
  2. GET /canva/auth  → redirects user to Canva's OAuth authorize page
  3. User approves → Canva redirects to GET /canva/callback?code=...
  4. We exchange the code for an access token (stored in memory for this session)
  5. POST /canva/open  → uploads the poster image to Canva as an asset,
     creates a design with it, and returns the direct Canva edit URL
  6. Browser opens that URL → user lands directly in Canva editor with the poster

Tokens are stored in a simple in-memory dict (sufficient for local single-user use).
"""
import base64
import hashlib
import json
import os
import secrets
import urllib.parse
from pathlib import Path

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from ..config import get_settings

settings   = get_settings()
router     = APIRouter(prefix="/canva", tags=["canva"])

CANVA_CLIENT_ID     = os.getenv("CANVA_CLIENT_ID", "OC-AZ8g8tJYeLsb")
CANVA_CLIENT_SECRET = os.getenv("CANVA_CLIENT_SECRET", "")
REDIRECT_URI        = "http://127.0.0.1:8001/canva/callback"
CANVA_AUTH_URL      = "https://www.canva.com/api/oauth/authorize"
CANVA_TOKEN_URL     = "https://api.canva.com/rest/v1/oauth/token"
CANVA_API_BASE      = "https://api.canva.com/rest/v1"
SCOPES              = "asset:read asset:write design:content:write design:meta:read"

# ── In-memory session state (single-user local app) ───────────────────────
_session: dict = {}   # keys: "access_token", "refresh_token", "pending_file"


# ── PKCE helpers ──────────────────────────────────────────────────────────

def _pkce_pair() -> tuple[str, str]:
    verifier  = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


# ── Token management ──────────────────────────────────────────────────────

def _exchange_code(code: str, verifier: str) -> dict:
    creds  = base64.b64encode(
        f"{CANVA_CLIENT_ID}:{CANVA_CLIENT_SECRET}".encode()
    ).decode()
    resp = requests.post(
        CANVA_TOKEN_URL,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  REDIRECT_URI,
            "code_verifier": verifier,
        },
        timeout=15,
    )
    if not resp.ok:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    return resp.json()


def _refresh_token() -> str:
    """Refresh the access token using the stored refresh token."""
    creds = base64.b64encode(
        f"{CANVA_CLIENT_ID}:{CANVA_CLIENT_SECRET}".encode()
    ).decode()
    resp = requests.post(
        CANVA_TOKEN_URL,
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type":    "refresh_token",
            "refresh_token": _session.get("refresh_token", ""),
        },
        timeout=15,
    )
    if not resp.ok:
        raise HTTPException(401, "Session expired. Please re-authorise via /canva/auth")
    tokens = resp.json()
    _session["access_token"]  = tokens["access_token"]
    _session["refresh_token"]  = tokens.get("refresh_token", _session["refresh_token"])
    return _session["access_token"]


def _auth_header() -> dict:
    token = _session.get("access_token")
    if not token:
        raise HTTPException(401, "Not authorised. Visit http://127.0.0.1:8001/canva/auth first.")
    return {"Authorization": f"Bearer {token}"}


# ── Step 1: Start OAuth ───────────────────────────────────────────────────

@router.get("/auth")
def canva_auth(file: str = Query(None, description="Poster filename to open after auth")):
    """Redirect the user to Canva's OAuth consent screen."""
    if not CANVA_CLIENT_SECRET:
        raise HTTPException(500,
            "CANVA_CLIENT_SECRET not set. Add it to python-service/.env")

    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)

    _session.update({
        "pkce_verifier": verifier,
        "oauth_state":   state,
        "pending_file":  file or _session.get("pending_file"),
    })

    params = {
        "code_challenge":        challenge,
        "code_challenge_method": "s256",
        "scope":                 SCOPES,
        "response_type":         "code",
        "client_id":             CANVA_CLIENT_ID,
        "state":                 state,
        "redirect_uri":          REDIRECT_URI,
    }
    url = CANVA_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)


# ── Step 2: OAuth callback ────────────────────────────────────────────────

@router.get("/callback")
def canva_callback(code: str = Query(None), state: str = Query(None),
                   error: str = Query(None)):
    """Canva redirects here after user approves (or denies) access."""
    if error:
        return HTMLResponse(f"""
          <h2>❌ Canva authorisation denied</h2>
          <p>{error}</p>
          <p>Close this tab and try again.</p>""", status_code=400)

    if state != _session.get("oauth_state"):
        return HTMLResponse("<h2>❌ Invalid state — possible CSRF</h2>", status_code=400)

    tokens = _exchange_code(code, _session["pkce_verifier"])
    _session["access_token"]  = tokens["access_token"]
    _session["refresh_token"] = tokens.get("refresh_token", "")
    _session["scopes"]        = tokens.get("scope", SCOPES)

    pending = _session.get("pending_file", "")

    # Auto-open the poster in Canva if we have a pending file
    if pending:
        return HTMLResponse(f"""
          <!DOCTYPE html><html><head>
            <title>Opening in Canva…</title>
            <script>
              // Auto-trigger the open-in-canva flow then close this tab
              fetch('/canva/open', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{filename: '{pending}'}})
              }})
              .then(r => r.json())
              .then(d => {{
                if (d.edit_url) {{
                  window.opener && window.opener.postMessage(
                    {{type:'CANVA_READY', url: d.edit_url}}, '*');
                  window.location.href = d.edit_url;
                }} else {{
                  document.body.innerHTML = '<h2>❌ ' + (d.detail || JSON.stringify(d)) + '</h2>';
                }}
              }})
              .catch(e => document.body.innerHTML = '<h2>Error: ' + e + '</h2>');
            </script>
          </head><body>
            <p>✅ Authorised! Uploading poster to Canva…</p>
          </body></html>""")

    return HTMLResponse("""
      <h2>✅ Connected to Canva!</h2>
      <p>You can now close this tab and click "Open in Canva" again.</p>""")


# ── Step 3: Upload poster + create design ─────────────────────────────────

class OpenRequest(BaseModel):
    filename: str   # e.g. "RES-001_poster_ai.png"


@router.post("/open")
def canva_open(req: OpenRequest):
    """
    Upload the poster image to Canva as an asset, create a design with it,
    and return the direct edit URL.
    """
    if not _session.get("access_token"):
        raise HTTPException(401, "not_authorised")

    img_path = settings.OUTPUTS_DIR / req.filename
    if not img_path.exists():
        raise HTTPException(404, f"File not found: {req.filename}")

    import time

    img_bytes = img_path.read_bytes()
    name      = img_path.stem.replace("_", " ").title()[:50]

    # Asset-Upload-Metadata: name must be Base64-encoded JSON
    name_b64  = base64.b64encode(name.encode()).decode()
    metadata  = json.dumps({"name_base64": name_b64})

    def _do_upload():
        return requests.post(
            f"{CANVA_API_BASE}/asset-uploads",
            headers={
                **_auth_header(),
                "Content-Type":          "application/octet-stream",
                "Asset-Upload-Metadata": metadata,
            },
            data=img_bytes,
            timeout=60,
        )

    # ── 1. Start asset upload job ─────────────────────────────────────────
    upload_resp = _do_upload()
    if upload_resp.status_code == 401:
        _refresh_token()
        upload_resp = _do_upload()

    if not upload_resp.ok:
        raise HTTPException(upload_resp.status_code,
            f"Asset upload failed: {upload_resp.text}")

    job_id = upload_resp.json()["job"]["id"]

    # ── 2. Poll until asset is ready (max 30s) ────────────────────────────
    asset_id = None
    for _ in range(15):
        time.sleep(2)
        poll = requests.get(
            f"{CANVA_API_BASE}/asset-uploads/{job_id}",
            headers=_auth_header(),
            timeout=15,
        )
        if not poll.ok:
            raise HTTPException(poll.status_code, f"Upload poll failed: {poll.text}")
        job = poll.json().get("job", {})
        status = job.get("status")
        if status == "success":
            asset_id = job["asset"]["id"]
            break
        if status == "failed":
            raise HTTPException(500,
                f"Asset upload failed: {job.get('error', {}).get('message', 'unknown')}")

    if not asset_id:
        raise HTTPException(504, "Asset upload timed out — try again")

    # ── 3. Create a design with the poster asset placed on the canvas ──────
    # We create a design and include the asset_id so Canva places the poster
    # as the first page element — the user can then move, resize, and add
    # text/shapes on top of it in the Canva editor.
    # Size: match the generated poster (1024×1536 portrait by default).
    # Choose canvas dimensions based on file type
    # PDF brochures (A4): 595×842  |  PNG posters (portrait): 1024×1536
    is_pdf = req.filename.lower().endswith(".pdf")
    if is_pdf:
        design_w, design_h = 595, 842
    else:
        design_w, design_h = 1024, 1536

    design_resp = requests.post(
        f"{CANVA_API_BASE}/designs",
        headers={**_auth_header(), "Content-Type": "application/json"},
        json={
            "type":        "type_and_asset",
            "design_type": {"type": "custom", "width": design_w, "height": design_h},
            "asset_id":    asset_id,
            "title":       name,
        },
        timeout=30,
    )

    if not design_resp.ok:
        raise HTTPException(design_resp.status_code,
            f"Design creation failed: {design_resp.text}")

    design   = design_resp.json()
    d        = design.get("design", design)
    edit_url = (d.get("urls", {}).get("edit_url")
                or f"https://www.canva.com/design/{d.get('id', '')}/edit")

    # Return both the edit URL and the asset URL so the UI can show helpful instructions
    asset_url = f"http://127.0.0.1:8001/files/{req.filename}"
    return {
        "ok":        True,
        "edit_url":  edit_url,
        "asset_id":  asset_id,
        "asset_url": asset_url,
    }


# ── Status check ──────────────────────────────────────────────────────────

@router.get("/status")
def canva_status():
    return {
        "connected": bool(_session.get("access_token")),
        "scopes":    _session.get("scopes", "unknown"),
    }


@router.get("/logout")
def canva_logout():
    """Clear the stored token — forces re-authorisation on next use."""
    _session.clear()
    return HTMLResponse("""
      <h2>✅ Disconnected from Canva</h2>
      <p>Token cleared. Close this tab and click "Open in Canva" again to reconnect.</p>""")
