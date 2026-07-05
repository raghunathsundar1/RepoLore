"""Chat-model construction — the single place providers/models/keys are handled.

Two tiers:
- Free tier: the server's own OPENAI_API_KEY with DEFAULT_MODEL (one generation and
  a few questions per user; enforced in app.py).
- BYOK: the user supplies {provider, model, api_key} per request. Keys are used for
  that request only — NEVER stored, NEVER logged.
"""
import re
from typing import Optional

DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-4o-mini"

# Curated dropdown suggestions per provider (the UI shows these; the API accepts any
# well-formed model id, since the key being spent is the user's own).
PROVIDERS = {
    "openai": {
        "label": "OpenAI",
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    },
    "anthropic": {
        "label": "Anthropic",
        "models": ["claude-haiku-4-5-20251001", "claude-sonnet-5", "claude-opus-4-8"],
    },
    "google": {
        "label": "Google Gemini",
        "models": ["gemini-2.5-flash", "gemini-2.5-pro"],
    },
}

_MODEL_ID_RE = re.compile(r"^[A-Za-z0-9._:\-]{1,100}$")


def validate_model_config(provider: str, model: str) -> Optional[str]:
    """Return an error message, or None if the config is acceptable."""
    if provider not in PROVIDERS:
        return f"Unknown provider {provider!r}. Choose one of: {', '.join(PROVIDERS)}."
    if not _MODEL_ID_RE.match(model or ""):
        return "Model id contains unsupported characters."
    return None


def make_chat_model(provider: str = DEFAULT_PROVIDER, model: str = DEFAULT_MODEL,
                    api_key: Optional[str] = None):
    """Build a LangChain chat model. api_key=None means the server's own env key
    (free tier). The key is passed straight to the client library and not retained."""
    common = {"temperature": 0, "timeout": 60, "max_retries": 2}
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        kwargs = dict(common)
        if api_key:
            kwargs["api_key"] = api_key
        return ChatOpenAI(model=model, **kwargs)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        kwargs = dict(common)
        if api_key:
            kwargs["api_key"] = api_key
        return ChatAnthropic(model=model, **kwargs)
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        kwargs = dict(common)
        if api_key:
            kwargs["google_api_key"] = api_key
        return ChatGoogleGenerativeAI(model=model, **kwargs)
    raise ValueError(f"Unknown provider: {provider!r}")
