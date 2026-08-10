"""
Direct SQLite access — reads/writes the exact same property_manager.db
the PHP app uses. Table/column naming matches api/db.php exactly:
  - one table per category, named "cat_<category>"
  - rows keyed by "_id" (TEXT PRIMARY KEY)
  - original (human-readable) column headers are stored in "_meta_headers"

SQLite's WAL mode (already enabled by the PHP app on first connection)
makes concurrent local access from both apps safe for normal CRUD usage.
"""
import sqlite3
import re
from contextlib import contextmanager
from .config import get_settings

settings = get_settings()


def _table(cat: str) -> str:
    cat = re.sub(r"[^a-zA-Z0-9_]", "", cat) or "cat"
    return f"cat_{cat}"


@contextmanager
def get_db():
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _header_map(conn, cat: str) -> dict:
    """sql_col -> original header, written by the PHP app's _meta_headers table."""
    try:
        rows = conn.execute(
            'SELECT sql_col, header FROM "_meta_headers" WHERE cat = ?', (cat,)
        ).fetchall()
        return {r["sql_col"]: r["header"] for r in rows}
    except sqlite3.OperationalError:
        return {}


def table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def list_categories() -> list[str]:
    """Every category that has data — found by scanning cat_* tables."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cat_%'"
        ).fetchall()
        return [r["name"][4:] for r in rows]  # strip "cat_" prefix


def get_properties(cat: str) -> dict:
    """Same shape as PHP's getProperties(): {'columns': [...], 'rows': [...]}"""
    table = _table(cat)
    with get_db() as conn:
        if not table_exists(conn, table):
            return {"columns": [], "rows": []}

        header_map = _header_map(conn, cat)
        cols = [r["name"] for r in conn.execute(f'PRAGMA table_info("{table}")') if r["name"] != "_id"]
        headers = [header_map.get(c, c) for c in cols]

        rows = []
        for r in conn.execute(f'SELECT * FROM "{table}"'):
            row = {"_id": r["_id"]}
            for c, h in zip(cols, headers):
                row[h] = r[c] if r[c] is not None else ""
            rows.append(row)

        return {"columns": headers, "rows": rows}


def get_property(cat: str, row_id: str) -> dict | None:
    data = get_properties(cat)
    for row in data["rows"]:
        if row["_id"] == row_id:
            return row
    return None


def get_photos(cat: str, row_id: str) -> list[dict]:
    cat_safe = re.sub(r"[^a-zA-Z0-9_]", "", cat)
    row_safe = re.sub(r"[^a-zA-Z0-9._-]", "", row_id)
    photo_dir = settings.UPLOADS_DIR / cat_safe / row_safe
    if not photo_dir.is_dir():
        return []
    files = sorted(
        [f for f in photo_dir.iterdir() if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    )
    return [{"filename": f.name, "path": str(f)} for f in files]
