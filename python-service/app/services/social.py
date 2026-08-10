"""
Social media asset generator. Also fully self-contained, no API key
needed. Takes the hero photo + property data and lays out branded
images at the right size for each platform.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

from .. import db
from ..config import get_settings

settings = get_settings()

SIZES = {
    "instagram_post": (1080, 1080),
    "instagram_story": (1080, 1920),
    "facebook_post": (1200, 630),
    "linkedin_post": (1200, 627),
    "whatsapp_status": (1080, 1920),
}

PURPLE = (91, 45, 142)
WHITE = (255, 255, 255)


def _font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def generate_social_asset(cat: str, row_id: str, platform: str = "instagram_post") -> Path:
    if platform not in SIZES:
        raise ValueError(f"Unknown platform '{platform}'. Choose from: {list(SIZES)}")

    row = db.get_property(cat, row_id)
    if not row:
        raise ValueError(f"Property {row_id} not found in category {cat}")

    photos = db.get_photos(cat, row_id)
    w, h = SIZES[platform]

    canvas = Image.new("RGB", (w, h), PURPLE)
    if photos:
        photo = Image.open(photos[0]["path"]).convert("RGB")
        # cover-fit
        scale = max(w / photo.width, (h * 0.7) / photo.height)
        photo = photo.resize((int(photo.width * scale), int(photo.height * scale)))
        px = (photo.width - w) // 2
        photo_crop = photo.crop((px, 0, px + w, int(h * 0.7)))
        canvas.paste(photo_crop, (0, 0))

    draw = ImageDraw.Draw(canvas)
    panel_top = int(h * 0.68)
    draw.rectangle([0, panel_top, w, h], fill=PURPLE)

    name = row.get("Property Name") or row.get("property_name") or "Property"
    price = row.get("Price (Readable)") or row.get("price_readable") or ""
    location = row.get("Location / Area") or row.get("location_area") or ""

    pad = int(w * 0.05)
    y = panel_top + pad
    draw.text((pad, y), name, font=_font(int(w * 0.055), bold=True), fill=WHITE)
    y += int(w * 0.08)
    if location:
        draw.text((pad, y), location, font=_font(int(w * 0.035)), fill=(220, 210, 235))
        y += int(w * 0.06)
    if price:
        draw.text((pad, y), str(price), font=_font(int(w * 0.05), bold=True), fill=(255, 215, 120))

    out_dir = settings.OUTPUTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{row_id}_{platform}.png"
    canvas.save(out_path)

    from .outputs import register_output
    register_output(out_path.name, "jpg", [name])

    return out_path
