import shutil
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse

from ..services import xlsx_sync

router = APIRouter(prefix="/xlsx", tags=["xlsx"])


@router.post("/export/{cat}")
def export_xlsx(cat: str):
    try:
        path = xlsx_sync.export_xlsx(cat)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return FileResponse(path, filename=path.name)


@router.post("/import/{cat}")
async def import_xlsx(cat: str, file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only .xlsx or .xls files allowed")
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
    try:
        result = xlsx_sync.import_xlsx(cat, tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return result
