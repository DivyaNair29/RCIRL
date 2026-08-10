from fastapi import APIRouter, HTTPException
from .. import db

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("/categories")
def categories():
    return {"categories": db.list_categories()}


@router.get("/{cat}")
def list_properties(cat: str):
    return db.get_properties(cat)


@router.get("/{cat}/{row_id}")
def get_property(cat: str, row_id: str):
    row = db.get_property(cat, row_id)
    if not row:
        raise HTTPException(404, f"Property {row_id} not found in {cat}")
    return row


@router.get("/{cat}/{row_id}/photos")
def get_photos(cat: str, row_id: str):
    return {"photos": db.get_photos(cat, row_id)}
