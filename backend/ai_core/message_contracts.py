from typing import Any


def _is_xyz_position(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    for key in ("x", "y", "z"):
        if key not in value:
            return False
        if not isinstance(value.get(key), (int, float)):
            return False
    return True


def validate_inbound_packet(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    packet_type = payload.get("type")
    if packet_type not in {"sync", "event", "signal"}:
        return None

    data = payload.get("data")
    if not isinstance(data, dict):
        return None

    if packet_type == "sync":
        position = data.get("position")
        if position is not None and not _is_xyz_position(position):
            return None
        return payload

    if packet_type == "signal":
        kind = data.get("kind")
        if kind is not None and not isinstance(kind, str):
            return None
        to_value = data.get("to")
        if to_value is not None and not isinstance(to_value, str):
            return None
        return payload

    event_name = data.get("event")
    if not isinstance(event_name, str) or not event_name.strip():
        return None
    target_value = data.get("target")
    if target_value is not None and not isinstance(target_value, str):
        return None
    payload_value = data.get("payload")
    if payload_value is not None and not isinstance(payload_value, dict):
        return None
    if not _validate_event_payload(event_name, payload_value):
        return None
    return payload


def _validate_event_payload(event_name: str, payload_value: Any) -> bool:
    if event_name == "heartbeat":
        return payload_value is None or isinstance(payload_value, dict)

    if event_name == "request_ui_translations":
        if not isinstance(payload_value, dict):
            return False
        base_keys = payload_value.get("base_keys")
        return isinstance(base_keys, dict) and bool(base_keys)

    if event_name in {"request_ephemeral_token", "request_adk_status", "persona_shift_request", "incantation_submitted", "dna_ab_feedback", "walk_vision_trigger"}:
        return isinstance(payload_value, dict)

    if event_name == "interaction_turn":
        return isinstance(payload_value, dict) and payload_value.get("input") is not None

    if event_name == "buff_applied":
        return isinstance(payload_value, dict) and (
            isinstance(payload_value.get("kind"), str)
            or isinstance(payload_value.get("action"), str)
        )

    if event_name == "item_dropped":
        return isinstance(payload_value, dict)

    if event_name == "match_end":
        return payload_value is None or isinstance(payload_value, dict)

    return True
