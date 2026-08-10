"""
Marketing copy generator.

Uses OpenAI if OPENAI_API_KEY is set.
Falls back to structured extraction from property data if no key —
so poster generation still works without an OpenAI key, just with
simpler copy derived directly from the property fields.
"""
import json
from .. import db
from ..config import get_settings

settings = get_settings()

TONE_GUIDANCE = {
    "luxury":    "Premium, aspirational language. Short punchy sentences. Emphasise exclusivity and prestige.",
    "modern":    "Clean, confident, contemporary. Avoid clichés like 'dream home'.",
    "minimal":   "Ultra-concise. Every word earns its place. No adjectives that aren't essential.",
    "corporate": "Professional, factual, business-appropriate. Suitable for commercial/industrial listings.",
    "tropical":  "Warm, inviting, lifestyle-focused. Evoke comfort and aspiration.",
    "gradient":  "Bold and striking. Attention-grabbing. Made for social media.",
}


def _fallback_copy(row: dict) -> dict:
    """Generate basic structured copy directly from property data fields,
    no API needed. Not as polished as AI but gives Nano Banana enough to work with."""
    name  = row.get("Property Name") or row.get("property_name") or "Property"
    loc   = row.get("Location / Area") or row.get("location_area") or ""
    price = row.get("Price (Readable)") or row.get("Price (₹)") or ""
    bhk   = row.get("BHK") or ""
    sqft  = row.get("Total Sq.Ft.") or row.get("Plot Area (Sq.Ft.)") or ""
    ptype = row.get("Type") or row.get("Property Sub-Type") or row.get("Land Type") or ""
    amenities = row.get("Amenities") or ""

    headline = name[:40]
    subheading = f"{bhk} {ptype} in {loc}".strip(" in").strip() if loc else (bhk or ptype or "Premium Property")

    features = []
    if bhk:       features.append(f"{bhk}")
    if sqft:      features.append(f"{sqft} Sq.Ft.")
    if ptype:     features.append(ptype)
    if amenities:
        for a in str(amenities).split(",")[:2]:
            if a.strip(): features.append(a.strip())
    if price:     features.append(f"Price: {price}")
    features = features[:4] or ["Premium Location", "Verified Listing"]

    return {
        "headline":   headline,
        "subheading": subheading,
        "features":   features,
        "cta":        "Contact Us Today",
    }


def build_prompt(cat: str, row: dict, tone: str) -> str:
    details = "\n".join(f"{k}: {v}" for k, v in row.items() if k != "_id" and v)
    guidance = TONE_GUIDANCE.get(tone, TONE_GUIDANCE["modern"])
    return f"""You are writing real estate marketing copy for a property listing.

Property category: {cat}
Property details:
{details}

Tone: {tone} — {guidance}

Return ONLY valid JSON (no markdown fences, no preamble) in this exact shape:
{{
  "headline": "under 8 words",
  "subheading": "one short line",
  "features": ["3-5 short bullet points, each under 6 words"],
  "cta": "under 6 words, action-oriented"
}}"""


def generate_copy(cat: str, row_id: str, tone: str = "modern") -> dict:
    row = db.get_property(cat, row_id)
    if not row:
        raise ValueError(f"Property {row_id} not found in category {cat}")

    if not settings.OPENAI_API_KEY:
        copy = _fallback_copy(row)
        return {"property_id": row_id, "category": cat, "tone": tone, "copy": copy, "fallback": True}

    import json as _json
    import requests as _req

    prompt = build_prompt(cat, row, tone)
    resp = _req.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.OPENAI_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "max_tokens": 500,
        },
        timeout=30,
    )

    if not resp.ok:
        raise RuntimeError(f"OpenAI API error {resp.status_code}: {resp.text}")

    text = resp.json()["choices"][0]["message"]["content"].strip()

    try:
        copy = _json.loads(text)
    except _json.JSONDecodeError as e:
        raise RuntimeError(f"Model did not return valid JSON: {e}\nRaw: {text}")

    return {"property_id": row_id, "category": cat, "tone": tone, "copy": copy}
