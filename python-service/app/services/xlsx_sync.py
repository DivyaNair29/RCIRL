"""
xlsx <-> SQLite sync. This replaces the Google Sheets sync idea from
earlier — same job (get external spreadsheet edits into the app, and get
app data back out as a spreadsheet), but using plain xlsx files since
this is a local app and Sheets would mean extra Google Cloud setup for
no real benefit here.

Two directions:
  - import_xlsx(cat, path): bulk-replaces a category's data from an xlsx
    file (e.g. a client hands you an updated spreadsheet). Mirrors the
    PHP app's "Import Excel" button exactly — same column auto-mapping.
  - export_xlsx(cat, path): writes the category's current SQLite data
    out to an xlsx file (e.g. to email a client, or edit in bulk and
    re-import). Mirrors the PHP app's "Export Excel" button.
"""
import re
import uuid
from pathlib import Path
import pandas as pd

from ..db import get_db, table_exists, _table, _header_map
from ..config import get_settings

settings = get_settings()


def _col_name(header: str) -> str:
    c = re.sub(r"[^\w]+", "_", str(header).strip())
    c = re.sub(r"_+", "_", c).strip("_").lower()
    return c or "col"


def export_xlsx(cat: str, dest_path: str | Path | None = None) -> Path:
    from .. import db as dbmod
    data = dbmod.get_properties(cat)
    if not data["columns"]:
        raise ValueError(f"No data found for category '{cat}'")

    rows = [{**{"_id": r["_id"]}, **{h: r.get(h, "") for h in data["columns"]}} for r in data["rows"]]
    df = pd.DataFrame(rows, columns=["_id"] + data["columns"])

    if dest_path is None:
        dest_path = settings.DATA_DIR / f"{cat}_export.xlsx"
    dest_path = Path(dest_path)
    df.to_excel(dest_path, index=False)
    return dest_path


def import_xlsx(cat: str, source_path: str | Path) -> dict:
    """Bulk-replaces the category's table — same semantics as the PHP
    'Import Excel' action: the uploaded file becomes the new dataset."""
    df = pd.read_excel(source_path, dtype=str).fillna("")
    if "_id" not in df.columns:
        df["_id"] = [f"r_{uuid.uuid4().hex[:12]}" for _ in range(len(df))]
    else:
        df["_id"] = df["_id"].apply(lambda v: v if v else f"r_{uuid.uuid4().hex[:12]}")

    headers = [c for c in df.columns if c != "_id"]
    col_map = {h: _col_name(h) for h in headers}
    table = _table(cat)

    with get_db() as conn:
        conn.execute(f'DROP TABLE IF EXISTS "{table}"')
        defs = ['"_id" TEXT PRIMARY KEY'] + [f'"{sc}" TEXT' for sc in col_map.values()]
        conn.execute(f'CREATE TABLE "{table}" ({", ".join(defs)})')

        conn.execute(
            'CREATE TABLE IF NOT EXISTS "_meta_headers" '
            "(cat TEXT, sql_col TEXT, header TEXT, PRIMARY KEY (cat, sql_col))"
        )
        for header, sql_col in col_map.items():
            conn.execute(
                'INSERT OR REPLACE INTO "_meta_headers" (cat, sql_col, header) VALUES (?, ?, ?)',
                (cat, sql_col, header),
            )

        cols_sql = ", ".join(f'"{c}"' for c in ["_id"] + list(col_map.values()))
        placeholders = ", ".join("?" for _ in range(len(col_map) + 1))
        insert_sql = f'INSERT INTO "{table}" ({cols_sql}) VALUES ({placeholders})'
        for _, row in df.iterrows():
            values = [row["_id"]] + [row[h] for h in headers]
            conn.execute(insert_sql, values)

    return {"ok": True, "category": cat, "rows_imported": len(df), "columns": headers}
