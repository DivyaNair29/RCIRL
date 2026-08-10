"""
AI Poster generation — OpenAI gpt-image-1 (needs OPENAI_API_KEY).

Speed: poster styles are generated in parallel using ThreadPoolExecutor.
"""
import base64
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

from .. import db
from ..config import get_settings

settings = get_settings()

# Variation styles — each v1/v2/v3 has a COMPLETELY DIFFERENT layout structure,
# color palette, typography direction, and photo treatment.
# These are designed to produce maximally different visual outputs.
VARIATION_STYLES = {
    "v1": (
        "LAYOUT: Property photo fills the ENTIRE LEFT HALF of the poster vertically. "
        "Right half: pure black (#0A0A0A) background panel with ALL text content. "
        "Color palette: ONLY black and gold (#C9A84C) — no other colors anywhere. "
        "Typography: Large elegant serif headline at the top of the right panel. "
        "Price displayed in oversized gold numerals, dominant visual element on right. "
        "Feature list in small gold dots. Footer in tiny white text at very bottom. "
        "CTA: thin gold-bordered button, no fill. "
        "Overall: dramatic split-screen, auction house aesthetic, zero gradients."
    ),
    "v2": (
        "LAYOUT: Property photo is a FULL-BLEED background covering 100% of the poster. "
        "On top of the photo: a frosted white semi-transparent panel (80% opacity) "
        "anchored to the BOTTOM THIRD of the poster, floating over the image. "
        "Color palette: white panel with deep navy (#0B2545) text and coral (#E8572A) accents. "
        "Typography: Bold condensed sans-serif headline inside the white panel. "
        "Price in a coral-colored badge/pill shape. "
        "Features as compact white tags with navy border. "
        "The property photo is fully visible through and around the panel — it dominates. "
        "Overall: modern editorial, floating card design, photo-first composition."
    ),
    "v3": (
        "LAYOUT: Poster divided into THREE horizontal bands. "
        "Top band (40%): property photo, full width, sharp rectangular crop. "
        "Middle band (35%): rich gradient background — deep emerald (#0D4F3C) to forest green, "
        "OR deep burgundy (#4A0E2D) to rose, chosen to complement the photo colors. "
        "Contains oversized bold white headline and price. "
        "Bottom band (25%): very dark charcoal (#1A1A1A), contains features in a single row "
        "as pill badges, and a bright contrasting CTA button. "
        "Typography: Extra-bold geometric sans-serif, large scale. "
        "Overall: magazine cover structure, strong color blocking, Instagram-optimized."
    ),
}


def build_poster_prompt(row: dict, copy: dict, style_key: str = "ai",
                        style_hint: str = "", size: str = "1024x1536",
                        columns: list | None = None) -> str:
    """Build poster prompt including ALL property fields. style_hint overrides style_key."""
    name     = row.get("Property Name") or row.get("property_name") or "Premium Property"
    location = row.get("Location / Area") or row.get("location_area") or ""
    price    = (row.get("Price (Readable)") or row.get("Price (\u20b9)")
                or row.get("price_readable") or "")
    headline = copy.get("headline") or name
    subhead  = copy.get("subheading") or location
    cta      = copy.get("cta") or "Contact Us Today"

    # ALL property fields — every selected column shown on the poster
    skip = {"_id", "Property Name", "property_name", "Location / Area",
            "location_area", "Price (Readable)", "price_readable", "Price (\u20b9)"}
    if columns:
        details = [(k, str(v)) for k, v in row.items()
                   if k in columns and k not in skip and v]
    else:
        details = [(k, str(v)) for k, v in row.items()
                   if k not in skip and v and not k.startswith("_")]

    spec_lines = "\n".join(f"  {k}: {v}" for k, v in details)

    ai_features = copy.get("features", [])
    highlights_block = (
        "\nKey Highlights (show as styled bullets or icon tags):\n"
        + "\n".join(f"  - {f}" for f in ai_features)
    ) if ai_features else ""

    specs_section = (
        "Property Specifications (show EVERY item below — do not skip any):\n"
        + spec_lines + highlights_block
    ) if spec_lines else ""

    orientation = {
        "1024x1536": "PORTRAIT — taller than wide. Instagram posts and print flyers.",
        "1024x1024": "SQUARE — equal sides. Facebook and social feeds.",
        "1536x1024": "LANDSCAPE — wider than tall. LinkedIn banners and web headers.",
    }.get(size, "PORTRAIT — taller than wide.")

    if style_hint.strip():
        style_block = (
            f"VISUAL STYLE DIRECTION:\n{style_hint.strip()}\n"
            "Apply this rigorously to every element: background, typography, "
            "color palette, layout, and decorative accents."
        )
    elif style_key in VARIATION_STYLES:
        var_num = {"v1": "ONE", "v2": "TWO", "v3": "THREE"}.get(style_key, style_key)
        style_block = (
            f"POSTER VARIATION {var_num} — must look COMPLETELY DIFFERENT "
            f"from any other version of this poster.\n\n"
            f"EXACT LAYOUT AND STYLE (follow precisely):\n"
            f"{VARIATION_STYLES[style_key]}"
        )
    else:
        style_block = (
            f"VISUAL STYLE — your creative decision:\n"
            f"You are a senior art director at a luxury real estate agency.\n"
            f"Study this property: location={location}, price={price}.\n"
            "Choose ONE bold, distinctive premium aesthetic and commit 100%."
        )

    return f"""You are producing a PREMIUM REAL ESTATE MARKETING POSTER for print and digital use.
Output format: {orientation}

=== PROPERTY PHOTO — ABSOLUTE RULE ===
The uploaded photograph is the HERO of this poster.
- Preserve it EXACTLY — do NOT alter, repaint, recolor, blur, or modify the building
- It must occupy at least 50% of the poster area, placed prominently
- Subtle dark vignette at photo EDGES ONLY is acceptable to aid text legibility
- Do NOT place text, frames, or decorative overlays on top of the building

=== VISUAL STYLE ===
{style_block}

=== ALL PROPERTY DETAILS — DISPLAY EVERY ITEM ON THE POSTER ===
Property Name  : {headline}
Location       : {subhead}
Price          : {price}

{specs_section}

Call to Action : {cta}

=== DESIGN QUALITY REQUIREMENTS ===
Content rules:
- Show EVERY specification listed above (BHK, sq.ft, floor, type, furnished status etc)
- Price must be VERY LARGE and immediately eye-catching — a dominant visual element
- Use icons, small labels, or a clean grid to display spec items neatly
- All spec text must be readable at a glance

Typography:
- HEADLINE = largest text element after the photo — bold and commanding
- Maximum 2 font families: display/serif for headlines, clean sans-serif for specs
- Strong contrast on ALL text — minimum 4.5:1 ratio against background
- No illegible script fonts for spec text

Layout and composition:
- Clear hierarchy: Photo -> Headline -> Price -> All Specs -> CTA
- CTA must be a distinct button, badge, or highlighted strip — not plain text
- Premium design accents: thin rule lines, geometric shapes, gradient strips, or texture
- Spacious, intentional layout — never cramped

Quality bar:
- Must look like a Sotheby's or JLL property card — not a basic flyer
- Every buyer should think: this property is worth serious attention
- NO watermarks, NO Lorem Ipsum, NO placeholder text, NO clip-art borders"""





# ─────────────────────────────────────────────
#  OpenAI image generation — gpt-image-1 (preferred, used first if key set)
#  Uses /v1/images/edits — takes the property photo as a reference image
#  so it stays untouched, and composites the poster design around it.
# ─────────────────────────────────────────────
def _prepare_image(photo_path: Path) -> tuple[bytes, str]:
    """Resize to max 1024px before upload — keeps requests fast."""
    try:
        from PIL import Image as PILImage
        img = PILImage.open(str(photo_path)).convert("RGB")
        w, h = img.size
        max_dim = 1024
        if max(w, h) > max_dim:
            scale = max_dim / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88)
        return buf.getvalue(), "image/jpeg"
    except ImportError:
        mime = "image/png" if photo_path.suffix.lower() == ".png" else "image/jpeg"
        return photo_path.read_bytes(), mime


def _stitch_photos(photos: list[Path], max_dim: int = 1024) -> tuple[bytes, str]:
    """
    Stitch up to 3 property photos into a single image for the AI.
    1 photo  → resize and send as-is
    2 photos → side by side (left|right)
    3 photos → main photo top (65%), two smaller below side by side (35%)
    """
    from PIL import Image as PILImage
    imgs = [PILImage.open(str(p)).convert("RGB") for p in photos]
    n = len(imgs)

    if n == 1:
        return _prepare_image(photos[0])

    if n == 2:
        # Resize both to same height, place side by side
        h = max_dim // 2
        resized = []
        for img in imgs:
            w, ih = img.size
            new_w = int(w * h / ih)
            resized.append(img.resize((new_w, h), PILImage.LANCZOS))
        total_w = sum(r.width for r in resized)
        canvas = PILImage.new("RGB", (min(total_w, max_dim * 2), h), (20, 20, 20))
        x = 0
        for r in resized:
            canvas.paste(r, (x, 0))
            x += r.width

    else:  # 3 photos
        main_h = int(max_dim * 0.65)
        thumb_h = max_dim - main_h
        # Main photo (top, full width)
        main = imgs[0]
        mw, mh = main.size
        main_w = int(mw * main_h / mh)
        main_r = main.resize((min(main_w, max_dim), main_h), PILImage.LANCZOS)
        total_w = main_r.width
        # Two thumbnails below
        thumb_w = total_w // 2
        t1 = imgs[1].resize((thumb_w, thumb_h), PILImage.LANCZOS)
        t2 = imgs[2].resize((thumb_w, thumb_h), PILImage.LANCZOS)
        canvas = PILImage.new("RGB", (total_w, max_dim), (20, 20, 20))
        canvas.paste(main_r, (0, 0))
        canvas.paste(t1, (0, main_h))
        canvas.paste(t2, (thumb_w, main_h))

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=88)
    return buf.getvalue(), "image/jpeg"


# Path to the RCIRL logo — placed in python-service/app/assets/
LOGO_PATH = Path(__file__).parent.parent / "assets" / "rcirl_logo.png"


def _stamp_logo(poster_path: Path) -> None:
    """
    Composite the RCIRL logo onto the bottom-right corner of a generated poster.
    Logo is resized to ~18% of poster width, placed 16px from bottom-right edge.
    Uses the pre-processed PNG with transparent background from app/assets/.
    """
    try:
        from PIL import Image as PILImage
        if not LOGO_PATH.exists():
            return   # logo file not found — skip silently

        poster = PILImage.open(str(poster_path)).convert("RGBA")
        PW, PH = poster.size

        logo = PILImage.open(str(LOGO_PATH)).convert("RGBA")
        LW, LH = logo.size

        # Resize logo to 18% of poster width, maintaining aspect ratio
        target_w = int(PW * 0.18)
        target_h = int(LH * target_w / LW)
        logo = logo.resize((target_w, target_h), PILImage.LANCZOS)

        # Position: bottom-right with 16px padding
        pad = 16
        x = PW - target_w - pad
        y = PH - target_h - pad

        # Paste logo using its alpha channel as mask
        poster.paste(logo, (x, y), logo)

        # Save back as JPEG (convert RGBA → RGB)
        poster.convert("RGB").save(str(poster_path), format="JPEG", quality=95)
    except Exception:
        pass   # never crash poster generation because of logo stamping


def _generate_openai(hero_photo: Path, prompt: str, out_path: Path, size: str = '1024x1536') -> Path:
    image_bytes, mime = _prepare_image(hero_photo)

    resp = requests.post(
        "https://api.openai.com/v1/images/edits",
        headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
        files={"image": (hero_photo.name, image_bytes, mime)},
        data={
            "model": "gpt-image-1",
            "prompt": prompt,
            "n": "1",
            "size": size,           # passed from UI: 1024x1536 | 1024x1024 | 1536x1024
            "quality": "medium",   # medium ~15-25s | low ~8-12s | high ~45-90s
        },
        timeout=120,
    )

    if not resp.ok:
        body = resp.text
        if resp.status_code in (429, 402) or any(
            kw in body.lower() for kw in ("quota", "billing", "insufficient", "credits")
        ):
            raise RuntimeError(
                f"OpenAI billing/quota error: {body}\n"
                "Check your OpenAI account at https://platform.openai.com/account/billing"
            )
        raise RuntimeError(f"OpenAI API error {resp.status_code}: {body}")

    data = resp.json()
    b64 = data["data"][0].get("b64_json") or data["data"][0].get("url")
    if not b64:
        raise RuntimeError("OpenAI did not return image data.")

    img_bytes = (
        requests.get(b64, timeout=30).content if b64.startswith("http")
        else base64.b64decode(b64)
    )
    out_path.write_bytes(img_bytes)
    _stamp_logo(out_path)
    return out_path



def generate_poster(
    cat: str, row_id: str, copy: dict, style_key: str = "ai",
    columns: list | None = None, hero_photo_urls: list | None = None,
    style_hint: str = "", size: str = "1024x1536",
) -> Path:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY not set. Add it to python-service/.env\n"
            "Get a key at https://platform.openai.com/api-keys"
        )

    row = db.get_property(cat, row_id)
    if not row:
        raise ValueError(f"Property {row_id} not found in category {cat}")

    # Filter to only selected columns if specified
    if columns:
        row = {k: v for k, v in row.items() if k in columns or k == "_id"}

    photos = db.get_photos(cat, row_id)
    if not photos:
        raise ValueError(f"No photos uploaded for {row_id} — upload at least one photo first.")

    # Resolve selected photos in order (or use first uploaded as fallback)
    photo_map = {Path(p["path"]).name: Path(p["path"]) for p in photos}
    selected_paths = []
    for url in (hero_photo_urls or []):
        fname = url.split("/")[-1]
        if fname in photo_map:
            selected_paths.append(photo_map[fname])
    if not selected_paths:
        selected_paths = [Path(photos[0]["path"])]

    # Add photo count context to the prompt
    photo_context = ""
    if len(selected_paths) > 1:
        photo_context = (
            f"\n\nPHOTO LAYOUT NOTE: You have been provided {len(selected_paths)} property photos "
            f"in a single composite image. "
            + ("The top portion is the main photo, bottom-left and bottom-right are additional views. " if len(selected_paths) == 3
               else "They are arranged side by side (left and right). ")
            + "Use all of them in your poster design — the main photo should be the hero, "
            "the additional photos can be shown as smaller accent images in the poster layout."
        )

    prompt = build_poster_prompt(row, copy, style_key=style_key, style_hint=style_hint, size=size) + photo_context

    out_dir = settings.OUTPUTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{row_id}_poster_{style_key}.png"

    # Stitch photos if multiple selected
    if len(selected_paths) > 1:
        img_bytes, mime = _stitch_photos(selected_paths)
        resp = requests.post(
            "https://api.openai.com/v1/images/edits",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            files={"image": ("composite.jpg", img_bytes, mime)},
            data={"model": "gpt-image-1", "prompt": prompt, "n": "1",
                  "size": size, "quality": "medium"},
            timeout=120,
        )
        if not resp.ok:
            raise RuntimeError(f"OpenAI API error {resp.status_code}: {resp.text}")
        data = resp.json()
        b64 = data["data"][0].get("b64_json") or data["data"][0].get("url")
        img_bytes = (requests.get(b64, timeout=30).content if b64.startswith("http")
                     else base64.b64decode(b64))
        out_path.write_bytes(img_bytes)
        return out_path

    return _generate_openai(selected_paths[0], prompt, out_path, size=size)


# ─────────────────────────────────────────────
#  Parallel batch generation — generates all styles concurrently
# ─────────────────────────────────────────────
def generate_poster_batch_parallel(cat: str, row_id: str, copy: dict, styles: list) -> list:
    """
    Generate multiple poster styles in parallel using threads.
    Returns list of {style, path, error} dicts.
    """
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not set. Add it to python-service/.env")

    row = db.get_property(cat, row_id)
    if not row:
        raise ValueError(f"Property {row_id} not found in category {cat}")

    photos = db.get_photos(cat, row_id)
    if not photos:
        raise ValueError(f"No photos uploaded for {row_id} — upload at least one photo first.")

    hero_photo = Path(photos[0]["path"])
    out_dir = settings.OUTPUTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    def _gen_one(style_key):
        prompt = build_poster_prompt(row, copy, style_key)
        out_path = out_dir / f"{row_id}_poster_{style_key}.png"
        try:
            _generate_openai(hero_photo, prompt, out_path)
            return {"style": style_key, "path": out_path, "error": None}
        except Exception as e:
            return {"style": style_key, "path": None, "error": str(e)}

    results = []
    max_workers = min(len(styles), 3)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_gen_one, s): s for s in styles}
        for future in as_completed(futures):
            results.append(future.result())

    return results
