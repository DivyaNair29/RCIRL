"""
PDF Brochure Generator — Premium A4, 2-page layout.

PAGE 1: Cover
  ┌───────────────────────────────┐
  │   FULL-BLEED HERO PHOTO       │  top 60%
  │   (dark gradient at bottom)   │
  ├───────────────────────────────┤
  │   PROPERTY NAME  |   PRICE    │  purple band
  ├───────────────────────────────┤
  │   Headline (large)            │
  │   Subheading (italic)         │  content area
  │   ● Feature 1                 │
  │   ● Feature 2  ...            │
  │   [Contact Us Today]          │
  ├───────────────────────────────┤
  │   COMPANY  ·  CONTACT         │  footer
  └───────────────────────────────┘

PAGE 2: Details
  ┌───────────────────────────────┐
  │  Purple header strip          │
  ├─────────────────┬─────────────┤
  │  PROPERTY       │ Photo 2     │
  │  DETAILS table  │             │
  │  (specs)        │ Photo 3     │
  ├─────────────────┴─────────────┤
  │  COMPANY  ·  CONTACT         │  footer
  └───────────────────────────────┘

ReportLab origin: (0,0) = BOTTOM-LEFT, Y increases UPWARD.
"""
from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas

from .. import db
from ..config import get_settings

settings = get_settings()

# ── Palette ────────────────────────────────────────────────────────────────
PURPLE      = HexColor("#5B2D8E")
PURPLE_DARK = HexColor("#3B1A6B")
PURPLE_PALE = HexColor("#EEE6F8")
PURPLE_MID  = HexColor("#7B3FBE")
GOLD        = HexColor("#C9A84C")
GOLD_LIGHT  = HexColor("#E8C97A")
DARK        = HexColor("#1A1A1A")
MID         = HexColor("#444444")
GREY_LITE   = HexColor("#F0F0F0")
GREY_MID    = HexColor("#CCCCCC")
WHITE       = white

# ── Fonts ──────────────────────────────────────────────────────────────────
R = "Helvetica"
B = "Helvetica-Bold"
I = "Helvetica-Oblique"

for rp, bp in [
    ("C:/Windows/Fonts/Arial.ttf",   "C:/Windows/Fonts/Arialbd.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]:
    if Path(rp).exists() and Path(bp).exists():
        try:
            pdfmetrics.registerFont(TTFont("_R", rp))
            pdfmetrics.registerFont(TTFont("_B", bp))
            R, B, I = "_R", "_B", "_R"
            break
        except Exception:
            pass


# ── Drawing helpers ────────────────────────────────────────────────────────

def _img(c, path, x, y, w, h):
    """Cover-crop image into rect. y = bottom edge (ReportLab origin)."""
    try:
        ir = ImageReader(str(path))
        iw, ih = ir.getSize()
        scale = max(w / iw, h / ih)
        dw, dh = iw * scale, ih * scale
        c.saveState()
        p = c.beginPath()
        p.rect(x, y, w, h)
        c.clipPath(p, stroke=0)
        c.drawImage(ir, x - (dw - w) / 2, y - (dh - h) / 2, dw, dh, mask="auto")
        c.restoreState()
    except Exception:
        c.setFillColor(PURPLE_PALE)
        c.rect(x, y, w, h, fill=1, stroke=0)


def _gradient_overlay(c, x, y, w, h, color=(0, 0, 0), max_alpha=0.75, steps=40):
    """Draw a vertical dark gradient from transparent (top) to max_alpha (bottom)."""
    for i in range(steps):
        a = max_alpha * ((i / steps) ** 1.5)
        c.setFillColor(Color(*color, alpha=a))
        row_h = h / steps
        c.rect(x, y + i * row_h, w, row_h + 0.5, fill=1, stroke=0)


def _wrap(c, text, font, size, max_w):
    words, line, lines = str(text).split(), "", []
    for w in words:
        t = (line + " " + w).strip()
        if c.stringWidth(t, font, size) <= max_w:
            line = t
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def _draw_footer(c, PW, FOOTER_H, M, company_name, contact, prop_id):
    """Draw the footer band — same on both pages."""
    c.setFillColor(PURPLE_DARK)
    c.rect(0, 0, PW, FOOTER_H, fill=1, stroke=0)
    # Gold top rule
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.5)
    c.line(0, FOOTER_H, PW, FOOTER_H)
    # Company name
    fy = FOOTER_H * 0.52
    c.setFillColor(WHITE)
    c.setFont(B, 10)
    c.drawString(M, fy, company_name[:50])
    # Contact right-aligned
    if contact:
        c.setFont(R, 9)
        c.setFillColor(HexColor("#C8B4E8"))
        c.drawRightString(PW - M, fy, str(contact)[:50])
    # Disclaimer
    c.setFont(R, 6.5)
    c.setFillColor(HexColor("#9B89B0"))
    c.drawCentredString(PW / 2, 3 * mm,
                        f"{prop_id} — All details subject to verification. E&OE.")


# ── Main brochure function ─────────────────────────────────────────────────

def generate_brochure(cat, row_id, company_name="RCIRL Property Consultant", columns=None):
    row = db.get_property(cat, row_id)
    if not row:
        raise ValueError(f"Property {row_id} not found in {cat}")

    photos = db.get_photos(cat, row_id)

    # AI copy
    ai = None
    try:
        from . import copywriter
        ai = copywriter.generate_copy(cat, row_id, tone="luxury")["copy"]
    except Exception:
        pass

    # Property data
    name     = row.get("Property Name") or row.get("property_name") or "Premium Property"
    prop_id  = row.get("Property ID") or row_id
    price    = row.get("Price (Readable)") or row.get("Price (₹)") or row.get("price_readable") or ""
    location = row.get("Location / Area") or row.get("location_area") or ""
    contact  = row.get("Contact") or row.get("contact") or ""

    headline = (ai or {}).get("headline")  or name
    subhead  = (ai or {}).get("subheading") or location
    features = (ai or {}).get("features")  or []
    cta      = (ai or {}).get("cta")       or "Contact Us Today"

    skip = {
        "_id", "Property ID", "Property Name", "Owner Name", "Contact",
        "Remarks", "Price (Readable)", "price_readable", "Location / Area",
        "location_area", "property_name", "property_id", "owner_name",
        "contact", "remarks",
    }
    # If caller specified columns, only show those (filtered by skip list too)
    if columns:
        specs = [(k, str(v)) for k, v in row.items()
                 if k in columns and k not in skip and v]
    else:
        specs = [(k, str(v)) for k, v in row.items() if k not in skip and v]

    # ── Page setup ─────────────────────────────────────────────────────────
    PW, PH   = A4          # 595.3 × 841.9 pt
    M        = 14 * mm     # side margin
    FOOTER_H = 16 * mm

    out_dir = settings.OUTPUTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{row_id}_brochure.pdf"
    c = rl_canvas.Canvas(str(out_path), pagesize=A4)

    # ══════════════════════════════════════════════════════════════════
    # PAGE 1 — COVER
    # ══════════════════════════════════════════════════════════════════

    HERO_H  = PH * 0.58            # top 58% = hero photo
    HERO_Y  = PH - HERO_H          # bottom edge of hero (in RL coords)
    BAND_H  = 22 * mm
    BAND_Y  = HERO_Y - BAND_H      # bottom edge of name band

    # 1a. Hero photo
    if photos:
        _img(c, photos[0]["path"], 0, HERO_Y, PW, HERO_H)
        # Gradient: transparent at top → dark at bottom of hero
        _gradient_overlay(c, 0, HERO_Y, PW, HERO_H * 0.55,
                          color=(0, 0, 0), max_alpha=0.7)
    else:
        c.setFillColor(PURPLE_DARK)
        c.rect(0, HERO_Y, PW, HERO_H, fill=1, stroke=0)

    # 1b. Property name band
    c.setFillColor(PURPLE_DARK)
    c.rect(0, BAND_Y, PW, BAND_H, fill=1, stroke=0)
    # Gold left accent stripe
    c.setFillColor(GOLD)
    c.rect(0, BAND_Y, 5, BAND_H, fill=1, stroke=0)
    # Name
    name_y = BAND_Y + BAND_H * 0.60
    c.setFillColor(WHITE)
    c.setFont(B, 15)
    c.drawString(M + 3, name_y, str(name)[:52])
    # Sub: prop_id · location
    c.setFont(R, 8)
    c.setFillColor(HexColor("#C8B4E8"))
    sub_txt = f"{prop_id}  ·  {location}" if location else prop_id
    c.drawString(M + 3, BAND_Y + BAND_H * 0.20, sub_txt[:68])
    # Price right-aligned, gold
    if price:
        c.setFont(B, 15)
        c.setFillColor(GOLD)
        c.drawRightString(PW - M, name_y, str(price))

    # 1c. Content area — between band and footer
    CONTENT_TOP = BAND_Y - 8 * mm
    CONTENT_BOT = FOOTER_H + 6 * mm

    cy = CONTENT_TOP   # cursor (decreasing)

    # Headline
    c.setFont(B, 20)
    c.setFillColor(PURPLE_DARK)
    for line in _wrap(c, headline, B, 20, PW - 2 * M)[:2]:
        if cy < CONTENT_BOT + 24: break
        c.drawString(M, cy, line)
        cy -= 13 * mm

    # Gold rule
    cy -= 2 * mm
    if cy > CONTENT_BOT:
        c.setStrokeColor(GOLD)
        c.setLineWidth(2)
        c.line(M, cy, M + PW * 0.35, cy)
        cy -= 6 * mm

    # Subheading
    c.setFont(I, 10.5)
    c.setFillColor(MID)
    for line in _wrap(c, subhead, R, 10.5, PW - 2 * M)[:2]:
        if cy < CONTENT_BOT + 14: break
        c.drawString(M, cy, line)
        cy -= 6.5 * mm
    cy -= 4 * mm

    # Features in 2 columns
    if features and cy > CONTENT_BOT + 30:
        c.setFont(B, 9)
        c.setFillColor(PURPLE)
        c.drawString(M, cy, "KEY HIGHLIGHTS")
        cy -= 6 * mm

        col_w = (PW - 2 * M - 10 * mm) / 2
        col2_x = M + col_w + 10 * mm
        feat_list = features[:8]
        half = (len(feat_list) + 1) // 2
        left_feats  = feat_list[:half]
        right_feats = feat_list[half:]

        feat_start_y = cy
        for feat in left_feats:
            if cy < CONTENT_BOT + 12: break
            c.setFillColor(GOLD)
            c.circle(M + 4, cy + 3, 3, fill=1, stroke=0)
            c.setFillColor(DARK)
            c.setFont(R, 9)
            c.drawString(M + 12, cy, str(feat)[:42])
            cy -= 6.5 * mm

        ry = feat_start_y
        for feat in right_feats:
            if ry < CONTENT_BOT + 12: break
            c.setFillColor(GOLD)
            c.circle(col2_x + 4, ry + 3, 3, fill=1, stroke=0)
            c.setFillColor(DARK)
            c.setFont(R, 9)
            c.drawString(col2_x + 12, ry, str(feat)[:42])
            ry -= 6.5 * mm

        cy = min(cy, ry) - 4 * mm

    # CTA button
    if cy > CONTENT_BOT + 14 * mm:
        BTN_W, BTN_H = 50 * mm, 10 * mm
        btn_y = max(cy - BTN_H, CONTENT_BOT + 2 * mm)
        c.setFillColor(PURPLE)
        c.roundRect(M, btn_y, BTN_W, BTN_H, 5, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont(B, 9)
        c.drawCentredString(M + BTN_W / 2, btn_y + 3, str(cta)[:28])

    _draw_footer(c, PW, FOOTER_H, M, company_name, contact, prop_id)

    c.showPage()

    # ══════════════════════════════════════════════════════════════════
    # PAGE 2 — PROPERTY DETAILS
    # ══════════════════════════════════════════════════════════════════

    # 2a. Header strip
    HDR_H = 18 * mm
    HDR_Y = PH - HDR_H
    c.setFillColor(PURPLE_DARK)
    c.rect(0, HDR_Y, PW, HDR_H, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, HDR_Y, 5, HDR_H, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont(B, 13)
    c.drawString(M + 3, HDR_Y + HDR_H * 0.38, "PROPERTY DETAILS")
    c.setFont(R, 9)
    c.setFillColor(HexColor("#C8B4E8"))
    c.drawRightString(PW - M, HDR_Y + HDR_H * 0.38, str(name)[:50])

    # 2b. Two-column body: specs left, photos right
    BODY_TOP = HDR_Y - 8 * mm
    BODY_BOT = FOOTER_H + 6 * mm
    BODY_H   = BODY_TOP - BODY_BOT

    extra_photos = photos[1:4]
    has_side_photos = len(extra_photos) > 0

    if has_side_photos:
        SPEC_W  = PW * 0.55 - M
        PHOTO_X = M + SPEC_W + 8 * mm
        PHOTO_W = PW - PHOTO_X - M
    else:
        SPEC_W  = PW - 2 * M
        PHOTO_X = 0
        PHOTO_W = 0

    # Spec table
    ROW_H = 8 * mm
    LBL_W = SPEC_W * 0.46
    sy    = BODY_TOP

    # Section label
    c.setFont(B, 9)
    c.setFillColor(PURPLE)
    c.drawString(M, sy, "SPECIFICATIONS")
    sy -= 6 * mm

    for i, (k, v) in enumerate(specs[:20]):
        if sy - ROW_H < BODY_BOT:
            break
        row_y = sy - ROW_H
        # Alternating row bg
        if i % 2 == 0:
            c.setFillColor(GREY_LITE)
            c.rect(M - 2, row_y, SPEC_W + 4, ROW_H, fill=1, stroke=0)
        # Key
        c.setFont(B, 8)
        c.setFillColor(MID)
        c.drawString(M + 3, row_y + 2.5, str(k)[:28])
        # Value
        c.setFont(R, 8)
        c.setFillColor(DARK)
        c.drawString(M + LBL_W, row_y + 2.5, str(v)[:28])
        # Bottom border line
        c.setStrokeColor(GREY_MID)
        c.setLineWidth(0.3)
        c.line(M, row_y, M + SPEC_W, row_y)
        sy -= ROW_H

    # Side photos (right column)
    if has_side_photos:
        n_photos = len(extra_photos)
        gap = 4 * mm
        photo_h = (BODY_H - (n_photos - 1) * gap) / n_photos
        for i, ph in enumerate(extra_photos):
            py = BODY_TOP - i * (photo_h + gap) - photo_h
            if py < BODY_BOT:
                break
            _img(c, ph["path"], PHOTO_X, py, PHOTO_W, photo_h)
            # Thin purple border
            c.setStrokeColor(PURPLE)
            c.setLineWidth(0.75)
            c.rect(PHOTO_X, py, PHOTO_W, photo_h, fill=0, stroke=1)

    _draw_footer(c, PW, FOOTER_H, M, company_name, contact, prop_id)

    c.showPage()
    c.save()

    try:
        from .outputs import register_output
        register_output(out_path.name, "pdf", [name])
    except Exception:
        pass

    return out_path
