import os
from pathlib import Path
from functools import lru_cache

IS_RAILWAY = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID"))


class Settings:
    # --- Database ---
    DB_PATH: Path = Path(
        os.getenv("DB_PATH",
            "/data/property_manager.db" if IS_RAILWAY
            else str(Path(__file__).parent.parent.parent / "php-app" / "property_data" / "property_manager.db")
        )
    )

    # --- File storage ---
    UPLOADS_DIR: Path = Path(
        os.getenv("UPLOADS_DIR",
            "/data/uploads" if IS_RAILWAY
            else str(Path(__file__).parent.parent.parent / "php-app" / "property_data" / "photos")
        )
    )
    OUTPUTS_DIR: Path = Path(
        os.getenv("OUTPUTS_DIR",
            "/data/outputs" if IS_RAILWAY
            else str(Path(__file__).parent.parent.parent / "python-service" / "outputs")
        )
    )

    # --- OpenAI ---
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_MODEL:   str = os.getenv("OPENAI_MODEL", "gpt-4o")

    # --- Canva Connect API ---
    CANVA_CLIENT_ID:     str = os.getenv("CANVA_CLIENT_ID", "OC-AZ8g8tJYeLsb")
    CANVA_CLIENT_SECRET: str = os.getenv("CANVA_CLIENT_SECRET", "")

    # --- Server ---
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8001"))


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Ensure all directories exist on startup
    s.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    s.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    s.OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    return s