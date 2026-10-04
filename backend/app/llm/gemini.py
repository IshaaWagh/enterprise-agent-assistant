"""Single entry point for Gemini calls: structured JSON out, retries, clean errors."""
import logging
import time
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.core.config import get_settings

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

RETRYABLE_CODES = {429, 500, 503}


class LLMError(Exception):
    """Any failure to get a valid answer from the LLM."""


def generate_json(prompt: str, system: str, schema: type[T], retries: int = 2) -> T:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise LLMError("GEMINI_API_KEY is not set")

    client = genai.Client(api_key=settings.gemini_api_key.get_secret_value())
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.2,
        response_mime_type="application/json",
    )

    for attempt in range(retries + 1):
        try:
            response = client.models.generate_content(
                model=settings.gemini_model, contents=prompt, config=config
            )
            if not response.text:
                raise LLMError("Gemini returned an empty response")
            return schema.model_validate_json(response.text)
        except errors.APIError as e:
            if e.code in RETRYABLE_CODES and attempt < retries:
                wait = 2 ** (attempt + 1)
                logger.warning("Gemini error %s, retrying in %ss", e.code, wait)
                time.sleep(wait)
                continue
            raise LLMError(f"Gemini API error {e.code}: {str(e.message)[:200]}") from e
        except ValidationError as e:
            raise LLMError("Gemini returned JSON that did not match the expected shape") from e
    raise LLMError("Gemini request failed after retries")