import json
import logging
import os
from typing import Any, Optional

# Standardize Logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_core")

def to_json_safe(value: Any) -> Any:
    """
    Recursively converts any value to a JSON-serializable type.
    Handles Pydantic models with model_dump() or dict().
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(k): to_json_safe(v) for k, v in value.items()}

    # Handle Pydantic / dataclasses
    for method_name in ("model_dump", "dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return to_json_safe(method())
            except Exception:
                pass
    return str(value)

def safe_json_loads(message: str) -> Optional[dict]:
    """
    Safely parses a JSON string into a dictionary.
    Returns None if parsing fails or result is not a dictionary.
    """
    if not isinstance(message, str) or not message.strip():
        return None
    try:
        payload = json.loads(message)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None

def clamp01(value: float) -> float:
    """Clamps a float value between 0.0 and 1.0."""
    return max(0.0, min(1.0, value))

def to_float(value: Any, default: float = 0.0) -> float:
    """Safely converts a value to float, returning a default on failure."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def to_int(value: Any, default: int = 0) -> int:
    """Safely converts a value to integer, returning a default on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
