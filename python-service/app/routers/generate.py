from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List

from ..services import copywriter, nano_banana, brochure, social

router = APIRouter(prefix="/generate", tags=["generate"])


class CopyRequest(BaseModel):
    cat: str
    row_id: str
    tone: str = "modern"


class PosterRequest(BaseModel):
    cat: str
    row_id: str
    tone: str = "modern"
    style: str = "modern"


class SinglePosterRequest(BaseModel):
    cat: str
    row_id: str
    columns: List[str] = []
    hero_photo_urls: List[str] = []
    style_prompt: str = ""
    tone: str = "luxury"
    variation: int = 1
    size: str = "1024x1536"


class BatchPosterRequest(BaseModel):
    cat: str
    row_id: str
    styles: List[str] = ["v1", "v2", "v3"]
    columns: List[str] = []
    hero_photo_urls: List[str] = []
    style_hint: str = ""
    size: str = "1024x1536"


class BrochureRequest(BaseModel):
    cat: str
    row_id: str
    company_name: str = "RCIRL Property Consultant"
    columns: List[str] = []


class SocialRequest(BaseModel):
    cat: str
    row_id: str
    platform: str = "instagram_post"


def _wrap(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e))


@router.get("/styles")
def list_styles():
    return {"styles": []}


@router.post("/copy")
def generate_copy(req: CopyRequest):
    return _wrap(copywriter.generate_copy, req.cat, req.row_id, req.tone)


@router.post("/poster")
def generate_poster(req: PosterRequest):
    """Generate a single AI poster."""
    copy_result = _wrap(copywriter.generate_copy, req.cat, req.row_id, req.tone)
    path = _wrap(nano_banana.generate_poster, req.cat, req.row_id, copy_result["copy"], req.style)
    filename = Path(path).name
    return {
        "ok": True,
        "style": req.style,
        "file": str(path),
        "url": f"/files/{filename}",
        "fallback_copy": copy_result.get("fallback", False),
    }


@router.post("/poster/single")
def generate_poster_single(req: SinglePosterRequest):
    """Generate one poster variation."""
    from ..services.copywriter import _fallback_copy
    from .. import db as _db
    try:
        copy_result = copywriter.generate_copy(req.cat, req.row_id, req.tone)
    except Exception:
        row = _db.get_property(req.cat, req.row_id)
        copy_result = {"copy": _fallback_copy(row) if row else {}, "fallback": True}

    var_key = f"v{req.variation}"
    path = _wrap(
        nano_banana.generate_poster,
        req.cat, req.row_id, copy_result["copy"],
        style_key=var_key,
        columns=req.columns or [],
        hero_photo_urls=req.hero_photo_urls or [],
        style_hint=req.style_prompt,
        size=req.size,
    )
    filename = Path(path).name
    return {
        "ok": True,
        "url": f"/files/{filename}",
        "file": str(path),
        "fallback_copy": copy_result.get("fallback", False),
        "posters": [{"label": f"Option {req.variation}", "url": f"/files/{filename}"}],
        "label": f"Option {req.variation}",
    }


@router.post("/poster/batch")
def generate_poster_batch(req: BatchPosterRequest):
    """Generate 3 poster variations in parallel — each with a distinct visual style."""
    import logging
    log = logging.getLogger("rcirl.poster")

    from ..services.copywriter import _fallback_copy
    from .. import db as _db

    try:
        copy_result = copywriter.generate_copy(req.cat, req.row_id)
    except Exception as e:
        log.error(f"Copy generation failed: {e}")
        row = _db.get_property(req.cat, req.row_id)
        if not row:
            raise HTTPException(404, f"Property '{req.row_id}' not found.")
        copy_result = {"copy": _fallback_copy(row), "fallback": True}

    # Detailed variation hints — each gives a completely different layout + palette + typography
    VARIATION_HINTS = {
        "v1": (
            "LAYOUT: Property photo fills the ENTIRE LEFT HALF of the poster vertically. "
            "Right half: pure black (#0A0A0A) background panel with ALL text content. "
            "Color palette: ONLY black and gold (#C9A84C) — no other colors anywhere. "
            "Typography: Large elegant serif headline at the top of the right panel. "
            "Price displayed in oversized gold numerals, dominant visual element on right. "
            "Specs/features in small neat rows with gold bullet dots. "
            "CTA: thin gold-bordered button, no fill. "
            "Overall: dramatic split-screen, auction house aesthetic, zero gradients."
        ),
        "v2": (
            "LAYOUT: Property photo occupies the TOP HALF of the poster, full width. "
            "Bottom half: pure white (#FFFFFF) background with all text content. "
            "Color palette: white background, deep navy (#0B2545) text, coral (#E8572A) accents for price and CTA. "
            "Typography: Bold condensed sans-serif headline below the photo. "
            "Price in a coral-colored badge/pill shape. "
            "Specs in a clean two-column grid with small navy labels. "
            "CTA as a solid coral button with white text. "
            "Overall: bright editorial, modern magazine, clean and airy."
        ),
        "v3": (
            "LAYOUT: Poster divided into THREE horizontal bands. "
            "Top band (55%): property photo, full width. "
            "Middle band (25%): rich gradient background — deep emerald (#0D4F3C) to forest green "
            "OR deep burgundy (#4A0E2D) to rose, chosen to complement the photo colors. "
            "Contains oversized bold white headline and price in large numerals. "
            "Bottom band (20%): very dark charcoal (#1A1A1A), contains all specs in a single row "
            "as small white pill badges, and a bright contrasting CTA button. "
            "Typography: Extra-bold geometric sans-serif, large scale. "
            "Overall: magazine cover structure, strong color blocking, Instagram-optimized."
        ),
    }

    # If user provided a style hint, use it for all 3 (overrides variation hints)
    if req.style_hint.strip():
        styles_with_hints = {k: req.style_hint.strip() for k in ["v1", "v2", "v3"]}
    else:
        styles_with_hints = VARIATION_HINTS

    try:
        batch_results = nano_banana.generate_poster_batch_parallel(
            req.cat, req.row_id, copy_result["copy"],
            styles=styles_with_hints,
            style_hint="",
            size=req.size,
            columns=req.columns or [],
            hero_photo_urls=req.hero_photo_urls or [],
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(400, str(e))

    results, errors = [], []
    for r in batch_results:
        if r["error"]:
            log.error(f"Variation '{r['style']}' failed: {r['error']}")
            errors.append({"style": r["style"], "error": r["error"]})
        else:
            filename = Path(r["path"]).name
            label = {"v1": "Option 1", "v2": "Option 2", "v3": "Option 3"}.get(r["style"], r["style"])
            results.append({"style": r["style"], "label": label, "url": f"/files/{filename}"})

    return {
        "ok": True,
        "posters": results,
        "errors": errors,
        "fallback_copy": copy_result.get("fallback", False),
        "diagnostics": {
            "cat": req.cat,
            "row_id": req.row_id,
            "styles_requested": list(styles_with_hints.keys()),
            "styles_succeeded": len(results),
            "styles_failed": len(errors),
        },
    }


@router.post("/brochure")
def generate_brochure(req: BrochureRequest):
    path = _wrap(brochure.generate_brochure, req.cat, req.row_id, req.company_name, req.columns or [])
    filename = Path(path).name
    return {"ok": True, "file": str(path), "url": f"/files/{filename}"}


@router.post("/brochure/batch")
def generate_brochure_batch(items: List[BrochureRequest]):
    """Generate brochures for multiple properties."""
    results = []
    for req in items:
        try:
            path = brochure.generate_brochure(req.cat, req.row_id, req.company_name, req.columns or [])
            filename = Path(path).name
            results.append({"cat": req.cat, "row_id": req.row_id, "ok": True, "url": f"/files/{filename}"})
        except Exception as e:
            results.append({"cat": req.cat, "row_id": req.row_id, "ok": False, "error": str(e)})
    return {"results": results}


@router.post("/social")
def generate_social(req: SocialRequest):
    path = _wrap(social.generate_social_asset, req.cat, req.row_id, req.platform)
    filename = Path(path).name
    return {"ok": True, "file": str(path), "url": f"/files/{filename}"}


@router.get("/social/platforms")
def list_platforms():
    return {"platforms": list(social.SIZES.keys())}