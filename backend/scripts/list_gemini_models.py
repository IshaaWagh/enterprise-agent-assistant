"""List Gemini models available to your API key.  Run: python -m scripts.list_gemini_models"""
from google import genai

from app.core.config import get_settings

key = get_settings().gemini_api_key
if not key:
    raise SystemExit("GEMINI_API_KEY is not set in .env")

client = genai.Client(api_key=key.get_secret_value())
for model in client.models.list():
    if "flash" in model.name.lower():
        print(model.name.removeprefix("models/"))