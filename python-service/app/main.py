"""
RCIRL AI Service — local FastAPI app.

Runs alongside the PHP property app on your computer, reading/writing the
same property_manager.db directly. Start it with:

    uvicorn app.main:app --reload --port 8001

or just run `python run_local.py` from the project root to start both
this and the PHP app together.
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .routers import properties, generate, xlsx, canva

settings = get_settings()

app = FastAPI(title="RCIRL AI Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # local-only app; tighten if you ever expose this beyond localhost
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties.router)
app.include_router(generate.router)
app.include_router(xlsx.router)
app.include_router(canva.router)

settings.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(settings.OUTPUTS_DIR)), name="files")


@app.get("/")
def health():
    return {
        "status": "ok",
        "db_exists": settings.DB_PATH.exists(),
        "db_path": str(settings.DB_PATH),
        "configured": {
            "openai": bool(settings.OPENAI_API_KEY),
        },
    }
