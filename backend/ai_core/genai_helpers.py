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


def collect_text_fragments(node: Any, fragments: list[str], depth: int = 0) -> None:
    if depth > 10:
        return
    if isinstance(node, str):
        text = node.strip()
        if text:
            fragments.append(text)
        return
    if isinstance(node, list):
        for item in node:
            collect_text_fragments(item, fragments, depth + 1)
        return
    if isinstance(node, dict):
        text = node.get("text")
        if isinstance(text, str) and text.strip():
            fragments.append(text.strip())
        for key, value in node.items():
            if key == "text":
                continue
            collect_text_fragments(value, fragments, depth + 1)
