"""
Patch for python-service/app/config.py
Replace the existing Settings class with this version.
It uses /data/ paths when RAILWAY_ENVIRONMENT is set, local paths otherwise.
"""
import os
from pathlib import Path
from functools import lru_cache

IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))

if IS_RAILWAY:
    DATA_ROOT = Path("/data")
else:
    DATA_ROOT = Path(__file__).parent.parent.parent  # project root

class Settings:
    # --- Database ---
    DB_PATH: Path = Path(os.getenv("DB_PATH", str(DATA_ROOT / "property_data" / "property_manager.db")))

    # --- File storage ---
    UPLOADS_DIR: Path = Path(os.getenv("UPLOADS_DIR", str(DATA_ROOT / "uploads")))
    OUTPUTS_DIR: Path = Path(os.getenv("OUTPUTS_DIR", str(DATA_ROOT / "outputs")))

    # --- OpenAI ---
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL:   str = os.getenv("OPENAI_MODEL", "gpt-4o")

    # --- Canva Connect API ---
    CANVA_CLIENT_ID:     str = os.getenv("CANVA_CLIENT_ID", "OC-AZ8g8tJYeLsb")
    CANVA_CLIENT_SECRET: str = os.getenv("CANVA_CLIENT_SECRET", "")

    # --- Server ---
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8001"))

    def __post_init__(self):
        self.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        self.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Ensure directories exist
    s.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    s.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    s.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    return s
