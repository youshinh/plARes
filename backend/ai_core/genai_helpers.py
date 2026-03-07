from typing import Any


def normalize_model_name(model_name: str, fallback: str) -> str:
    raw = (model_name or fallback).strip()
    if not raw:
        raw = fallback
    if raw.startswith("models/"):
        return raw
    return f"models/{raw}"


def parse_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def normalize_modalities(value: Any) -> list[str]:
    allowed = {"TEXT", "AUDIO", "IMAGE"}
    raw_items: list[Any]
    if isinstance(value, str):
        raw_items = [value]
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = ["AUDIO"]

    normalized: list[str] = []
    for item in raw_items:
        key = str(item).strip().upper()
        if key in allowed and key not in normalized:
            normalized.append(key)
    return normalized or ["AUDIO"]


IGNORED_TEXT_KEYS = {
    "thought",
    "thought_signature",
    "thoughtSignature",
    "signature",
    "inlineData",
    "inline_data",
    "data",
    "model",
    "modelVersion",
    "name",
    "id",
    "mimeType",
    "mime_type",
}


def _looks_like_metadata_text(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    lowered = stripped.lower()
    if lowered.startswith("models/"):
        return True
    if " thought " in f" {lowered} " or lowered.startswith("thought") or lowered.startswith("incomplete"):
        return True
    if len(stripped) > 48 and all(ch.isalnum() or ch in "+/=_-" for ch in stripped):
        return True
    return False


def collect_text_fragments(node: Any, fragments: list[str], depth: int = 0) -> None:
    if depth > 10:
        return
    if isinstance(node, str):
        text = node.strip()
        if text and not _looks_like_metadata_text(text):
            fragments.append(text)
        return
    if isinstance(node, list):
        for item in node:
            collect_text_fragments(item, fragments, depth + 1)
        return
    if isinstance(node, dict):
        text = node.get("text")
        if isinstance(text, str) and text.strip() and not _looks_like_metadata_text(text):
            fragments.append(text.strip())
        for key, value in node.items():
            if key == "text" or key in IGNORED_TEXT_KEYS:
                continue
            collect_text_fragments(value, fragments, depth + 1)
