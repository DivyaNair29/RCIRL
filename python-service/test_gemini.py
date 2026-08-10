"""
Run this from inside python-service/ to diagnose the Gemini API key.
Usage:  python test_gemini.py
"""
import os, sys
from pathlib import Path

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    print("✅ .env loaded")
except ImportError:
    print("⚠️  python-dotenv not installed — reading os.environ only")

key   = os.getenv("GEMINI_API_KEY", "")
model = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

print(f"\n🔑 GEMINI_API_KEY : {'SET — ' + key[:8] + '…' + key[-4:] if key else '❌ NOT SET'}")
print(f"🤖 GEMINI_IMAGE_MODEL: {model}\n")

if not key:
    print("❌ No API key found. Add GEMINI_API_KEY to python-service/.env")
    sys.exit(1)

# Test 1: plain text call (no image, no quota for image gen) — just checks auth
print("── Test 1: Auth check (text-only, uses no image quota) ──")
try:
    from google import genai
    client = genai.Client(api_key=key)
    r = client.models.generate_content(
        model="gemini-2.5-flash",          # text model, always free
        contents=["Say: KEY_OK"],
    )
    print("✅ API key is valid:", r.text.strip())
except Exception as e:
    print("❌ Auth/text call failed:", e)
    sys.exit(1)

# Test 2: image generation with the configured model (this is what RCIRL uses)
print(f"\n── Test 2: Image generation with {model} ──")
try:
    from google.genai import types
    # Tiny 1×1 white JPEG so we're not uploading a real property photo
    import base64
    ONE_PX = base64.b64decode(
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS"
        "Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ"
        "CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
        "MjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/"
        "EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/"
        "aAAwDAQACEQMRAD8AJQAB/9k="
    )
    r2 = client.models.generate_content(
        model=model,
        contents=[
            types.Part.from_bytes(data=ONE_PX, mime_type="image/jpeg"),
            "Create a simple red square image, no text.",
        ],
    )
    has_img = any(getattr(p, "inline_data", None) for p in r2.candidates[0].content.parts)
    if has_img:
        print(f"✅ Image generation works! Model '{model}' returned an image.")
    else:
        print("⚠️  Call succeeded but no image returned. Parts:", r2.candidates[0].content.parts)
except Exception as e:
    err = str(e)
    print(f"❌ Image generation failed: {err}\n")
    if "RESOURCE_EXHAUSTED" in err or "429" in err:
        print("👉 Quota is genuinely exhausted.")
        print("   Options:")
        print("   A) Wait — free tier resets at midnight Pacific Time")
        print("   B) Go to https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas")
        print("      and check remaining quota")
        print("   C) Create a NEW API key in a fresh Google account at https://aistudio.google.com/apikey")
    elif "API_KEY_INVALID" in err or "403" in err:
        print("👉 API key is invalid or revoked. Generate a new one at https://aistudio.google.com/apikey")
    elif "not found" in err.lower() or "404" in err:
        print(f"👉 Model '{model}' not found. Try: gemini-2.5-flash-image or gemini-2.0-flash-exp")
