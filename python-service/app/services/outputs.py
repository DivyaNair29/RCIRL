"""
Registers a generated file into php-app/outputs/index.json — the exact
same index the PHP app's Outputs gallery page reads. This is what makes
AI-generated posters/brochures/social assets show up in the app's
"Outputs" tab with View/Download/Delete, instead of being invisible
files only reachable by hitting the Python API directly.
"""
import json
from pathlib import Path
from datetime import datetime
from ..config import get_settings

settings = get_settings()


def _index_path() -> Path:
    return settings.OUTPUTS_DIR / "index.json"


def _read_index() -> list:
    p = _index_path()
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return []


def _write_index(index: list):
    _index_path().write_text(json.dumps(index, indent=2, ensure_ascii=False))


def register_output(filename: str, file_type: str, properties: list[str]) -> dict:
    """Adds an entry to the shared outputs index — same shape the PHP
    saveOutput() action writes, so the existing Outputs gallery picks it
    up with no changes needed on the PHP side."""
    path = settings.OUTPUTS_DIR / filename
    entry = {
        "filename": filename,
        "type": file_type,
        "properties": properties,
        "size": path.stat().st_size if path.exists() else 0,
        "created": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    index = _read_index()
    index.insert(0, entry)
    _write_index(index)
    return entry


def remove_output_file(filename: str):
    """Deletes a generated file that was never registered (e.g. an
    unselected poster variant) — keeps the outputs folder from filling
    up with files nobody chose."""
    path = settings.OUTPUTS_DIR / filename
    if path.exists():
        path.unlink()
