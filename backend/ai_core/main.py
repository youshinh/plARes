import asyncio
import json
import os
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.exceptions import ConnectionClosed

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

try:
    from .streaming.bidi_session import handle_client_connection as adk_live_handler
except Exception as exc:  # pragma: no cover - import may fail in local envs
    adk_live_handler = None
    ADK_IMPORT_ERROR = str(exc)
else:
    ADK_IMPORT_ERROR = ""

try:
    import firebase_admin  # type: ignore
    from firebase_admin import firestore as firebase_firestore  # type: ignore
except Exception:
    firebase_admin = None
    firebase_firestore = None

try:
    from google import genai  # type: ignore
    from google.genai import types as genai_types  # type: ignore
except Exception:
    genai = None
    genai_types = None

try:
    from ..infrastructure.multimodal_pipeline import RealityFusionCrafter  # type: ignore
except Exception:
    try:
        from backend.infrastructure.multimodal_pipeline import RealityFusionCrafter  # type: ignore
    except Exception:
        try:
            from infrastructure.multimodal_pipeline import RealityFusionCrafter  # type: ignore
        except Exception:
            RealityFusionCrafter = None

if load_dotenv is not None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(env_path, override=False)

HOST = os.getenv("PLARES_HOST", "0.0.0.0")
PORT = int(os.getenv("PLARES_PORT", "8000"))
GAME_PATH = "/ws/game"
AUDIO_PATH = "/ws/audio"
LIVE_PATH = "/ws/live"
MATCH_LOG_DIR = Path(
    os.getenv(
        "PLARES_MATCH_LOG_DIR",
        str(Path(__file__).resolve().parents[1] / "runtime" / "match_logs"),
    )
)
USER_RUNTIME_DIR = Path(
    os.getenv(
        "PLARES_USER_RUNTIME_DIR",
        str(Path(__file__).resolve().parents[1] / "runtime" / "users"),
    )
)
MAX_MEMORY_SUMMARY_CHARS = 1200
FIRESTORE_MODE = os.getenv("PLARES_FIRESTORE_MODE", "auto").strip().lower()
FIRESTORE_ENABLED = FIRESTORE_MODE not in {"off", "false", "disabled", "local"}
MATCH_LOG_TTL_DAYS = int(os.getenv("PLARES_MATCH_LOG_TTL_DAYS", "180"))
EPHEMERAL_API_VERSION = os.getenv("PLARES_EPHEMERAL_API_VERSION", "v1alpha").strip() or "v1alpha"
INTERACTIONS_API_VERSION = (
    os.getenv("PLARES_INTERACTIONS_API_VERSION", "v1alpha").strip() or "v1alpha"
)
EPHEMERAL_MODEL = (
    os.getenv("PLARES_EPHEMERAL_MODEL")
    or os.getenv("PLARES_ADK_MODEL")
    or "models/gemini-live-2.5-flash-preview"
)
INTERACTIONS_MODEL = (
    os.getenv("PLARES_INTERACTIONS_MODEL")
    or os.getenv("PLARES_LIGHT_MODEL")
    or "models/gemini-flash-latest"
)
EPHEMERAL_DEFAULT_USES = int(os.getenv("PLARES_EPHEMERAL_USES", "3"))
EPHEMERAL_EXPIRE_MINUTES = int(os.getenv("PLARES_EPHEMERAL_EXPIRE_MINUTES", "10"))
EPHEMERAL_NEW_SESSION_MINUTES = int(os.getenv("PLARES_EPHEMERAL_NEW_SESSION_MINUTES", "60"))

game_clients: dict[Any, dict[str, Any]] = {}
room_members: dict[str, set[Any]] = defaultdict(set)
room_user_map: dict[str, dict[str, Any]] = defaultdict(dict)
room_user_meta: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
room_runtime_state: dict[str, dict[str, Any]] = {}
reality_crafter = RealityFusionCrafter() if RealityFusionCrafter is not None else None
_firestore_client: Any | None = None
_firestore_disabled_reason: str = ""
_genai_clients: dict[str, Any] = {}
_genai_disabled_reason: str = ""


def _safe_json_loads(message: str) -> Optional[dict]:
    try:
        payload = json.loads(message)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None


def _to_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _to_json_safe(v) for k, v in value.items()}

    for method_name in ("model_dump", "dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return _to_json_safe(method())
            except Exception:
                pass
    return str(value)


def _normalize_model_name(model_name: str, fallback: str) -> str:
    raw = (model_name or fallback).strip()
    if not raw:
        raw = fallback
    if raw.startswith("models/"):
        return raw
    return f"models/{raw}"


def _parse_bool(value: Any, default: bool) -> bool:
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


def _normalize_modalities(value: Any) -> list[str]:
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


def _query_from_path(request_path: str) -> dict[str, list[str]]:
    parsed = urlparse(request_path)
    return parse_qs(parsed.query)


def _parse_lang(query: dict[str, list[str]]) -> str:
    raw = str(query.get("lang", ["en-US"])[0]).strip()
    return raw if raw else "en-US"


def _parse_sync_rate(query: dict[str, list[str]], default: float = 0.5) -> float:
    raw = query.get("sync_rate", [str(default)])[0]
    try:
        return _clamp01(float(raw))
    except (TypeError, ValueError):
        return default


def _parse_game_identity(request_path: str) -> tuple[str, str, str, float]:
    query = _query_from_path(request_path)
    user_id = query.get("user_id", [f"user_{uuid.uuid4().hex[:8]}"])[0]
    room_id = query.get("room_id", ["default"])[0]
    lang = _parse_lang(query)
    sync_rate = _parse_sync_rate(query, default=0.5)
    return user_id, room_id, lang, sync_rate


def _parse_audio_identity(request_path: str) -> tuple[str, str, str, float]:
    query = _query_from_path(request_path)
    user_id = query.get("user_id", [f"audio_{uuid.uuid4().hex[:8]}"])[0]
    room_id = query.get("room_id", ["default"])[0]
    lang = _parse_lang(query)
    sync_rate = _parse_sync_rate(query, default=0.5)
    return user_id, room_id, lang, sync_rate


def _lang_bucket(lang: str) -> str:
    lowered = (lang or "en-US").lower()
    if lowered.startswith("ja"):
        return "ja"
    if lowered.startswith("es"):
        return "es"
    return "en"


def _localized_tactics(lang: str) -> list[dict[str, Any]]:
    bucket = _lang_bucket(lang)
    if bucket == "ja":
        return [
            {
                "id": "tactics_cover",
                "title": "障害物へ退避",
                "detail": "敵の大技を待ってカウンター",
                "action": "take_cover",
                "target": {"x": 0.8, "y": 0.0, "z": -1.2},
            },
            {
                "id": "tactics_flank",
                "title": "右側面を取る",
                "detail": "横移動で死角を作る",
                "action": "flank_right",
                "target": {"x": 1.5, "y": 0.0, "z": -1.6},
            },
        ]
    if bucket == "es":
        return [
            {
                "id": "tactics_cover",
                "title": "Refugiate tras cobertura",
                "detail": "Espera la tecnica fuerte y contraataca",
                "action": "take_cover",
                "target": {"x": 0.8, "y": 0.0, "z": -1.2},
            },
            {
                "id": "tactics_flank",
                "title": "Flanquea por derecha",
                "detail": "Crea un angulo muerto con movimiento lateral",
                "action": "flank_right",
                "target": {"x": 1.5, "y": 0.0, "z": -1.6},
            },
        ]
    return [
        {
            "id": "tactics_cover",
            "title": "Take Cover",
            "detail": "Wait for the enemy special and counter",
            "action": "take_cover",
            "target": {"x": 0.8, "y": 0.0, "z": -1.2},
        },
        {
            "id": "tactics_flank",
            "title": "Flank Right",
            "detail": "Create a blind spot with lateral movement",
            "action": "flank_right",
            "target": {"x": 1.5, "y": 0.0, "z": -1.6},
        },
    ]


def _special_phrase_for_lang(lang: str) -> str:
    bucket = _lang_bucket(lang)
    if bucket == "ja":
        return "超絶熱々揚げ春巻きストライク"
    if bucket == "es":
        return "El perro de San Roque no tiene rabo"
    return "Super Sonic Scorching Spring Roll Strike"


def _tone_message(lang: str, tone: str) -> str:
    bucket = _lang_bucket(lang)
    if bucket == "ja":
        messages = {
            "focused": "機体の口調が集中モードへ変化",
            "balanced": "機体の口調が標準モードへ戻った",
            "confident": "機体の口調が強気モードへ変化",
        }
    elif bucket == "es":
        messages = {
            "focused": "El tono cambio a modo concentrado",
            "balanced": "El tono volvio al modo equilibrado",
            "confident": "El tono cambio a modo confiado",
        }
    else:
        messages = {
            "focused": "Persona tone shifted to focused mode",
            "balanced": "Persona tone returned to balanced mode",
            "confident": "Persona tone shifted to confident mode",
        }
    return messages.get(tone, messages["balanced"])


def _get_firestore_client() -> Any | None:
    global _firestore_client, _firestore_disabled_reason
    if _firestore_client is not None:
        return _firestore_client
    if not FIRESTORE_ENABLED:
        _firestore_disabled_reason = "disabled_by_env"
        return None
    if firebase_admin is None or firebase_firestore is None:
        _firestore_disabled_reason = "firebase_admin_not_installed"
        return None

    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _firestore_client = firebase_firestore.client()
        return _firestore_client
    except Exception as exc:
        _firestore_disabled_reason = str(exc)
        return None


def _load_profile_from_firestore(user_id: str) -> dict[str, Any] | None:
    db = _get_firestore_client()
    if db is None:
        return None
    try:
        snap = db.collection("users").document(user_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict()
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _save_profile_to_firestore(profile: dict[str, Any]) -> None:
    db = _get_firestore_client()
    if db is None:
        return
    user_id = str(profile.get("user_id", ""))
    if not user_id:
        return
    try:
        robot = profile.get("robot", {})
        logs = profile.get("match_logs", [])
        recent = logs[-5:] if isinstance(logs, list) else []
        payload = {
            "player_name": profile.get("player_name"),
            "lang": profile.get("lang"),
            "total_matches": profile.get("total_matches", 0),
            "ai_memory_summary": profile.get("ai_memory_summary", ""),
            "pending_milestone": profile.get("pending_milestone", 0),
            "robot": robot,
            "recent_match_logs": recent,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        db.collection("users").document(user_id).set(payload, merge=True)
    except Exception:
        return


def _save_match_log_to_firestore(user_id: str, match_log: dict[str, Any]) -> None:
    db = _get_firestore_client()
    if db is None:
        return
    ts = str(match_log.get("timestamp", datetime.now(timezone.utc).isoformat()))
    room = str(match_log.get("room_id", "unknown"))
    doc_id = f"{ts}_{room}".replace(":", "-")
    try:
        payload = dict(match_log)
        expires = payload.get("expires_at")
        if isinstance(expires, str):
            try:
                payload["expires_at"] = datetime.fromisoformat(expires)
            except Exception:
                pass
        db.collection("users").document(user_id).collection("matchLogs").document(doc_id).set(payload)
    except Exception:
        return


def _get_genai_client(api_version: str) -> Any | None:
    global _genai_disabled_reason
    cached = _genai_clients.get(api_version)
    if cached is not None:
        return cached
    if genai is None or genai_types is None:
        _genai_disabled_reason = "google_genai_unavailable"
        return None
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        _genai_disabled_reason = "api_key_missing"
        return None

    try:
        client = genai.Client(api_key=api_key, http_options={"api_version": api_version})
    except Exception:
        try:
            client = genai.Client(api_key=api_key)
        except Exception as exc:
            _genai_disabled_reason = str(exc)
            return None

    _genai_clients[api_version] = client
    return client


def _collect_text_fragments(node: Any, fragments: list[str], depth: int = 0) -> None:
    if depth > 10:
        return
    if isinstance(node, str):
        text = node.strip()
        if text:
            fragments.append(text)
        return
    if isinstance(node, list):
        for item in node:
            _collect_text_fragments(item, fragments, depth + 1)
        return
    if isinstance(node, dict):
        text = node.get("text")
        if isinstance(text, str) and text.strip():
            fragments.append(text.strip())
        for key, value in node.items():
            if key == "text":
                continue
            _collect_text_fragments(value, fragments, depth + 1)


def _issue_ephemeral_token_sync(requested: dict[str, Any], user_id: str, room_id: str) -> dict[str, Any]:
    client = _get_genai_client(EPHEMERAL_API_VERSION)
    if client is None or genai_types is None:
        return {
            "kind": "live_ephemeral_token",
            "ok": False,
            "error": "gemini_client_unavailable",
            "detail": _genai_disabled_reason or "unknown",
            "user_id": user_id,
            "room_id": room_id,
        }

    model = _normalize_model_name(str(requested.get("model", EPHEMERAL_MODEL)), EPHEMERAL_MODEL)
    modalities = _normalize_modalities(requested.get("response_modalities", ["AUDIO"]))
    uses = requested.get("uses", EPHEMERAL_DEFAULT_USES)
    try:
        uses_value = max(1, min(20, int(uses)))
    except (TypeError, ValueError):
        uses_value = EPHEMERAL_DEFAULT_USES

    expire_minutes = requested.get("expire_minutes", EPHEMERAL_EXPIRE_MINUTES)
    try:
        expire_minutes_value = max(1, min(60, int(expire_minutes)))
    except (TypeError, ValueError):
        expire_minutes_value = EPHEMERAL_EXPIRE_MINUTES

    new_session_minutes = requested.get("new_session_minutes", EPHEMERAL_NEW_SESSION_MINUTES)
    try:
        new_session_minutes_value = max(5, min(1440, int(new_session_minutes)))
    except (TypeError, ValueError):
        new_session_minutes_value = EPHEMERAL_NEW_SESSION_MINUTES

    live_cfg_kwargs: dict[str, Any] = {
        "response_modalities": modalities,
    }

    temperature = requested.get("temperature")
    if isinstance(temperature, (int, float)):
        live_cfg_kwargs["temperature"] = float(temperature)

    system_instruction = requested.get("system_instruction")
    if isinstance(system_instruction, str) and system_instruction.strip():
        live_cfg_kwargs["system_instruction"] = system_instruction.strip()

    if _parse_bool(requested.get("session_resumption"), True):
        live_cfg_kwargs["session_resumption"] = genai_types.SessionResumptionConfig()

    now = datetime.now(timezone.utc)
    try:
        config = genai_types.CreateAuthTokenConfig(
            uses=uses_value,
            expire_time=now + timedelta(minutes=expire_minutes_value),
            new_session_expire_time=now + timedelta(minutes=new_session_minutes_value),
            live_connect_constraints=genai_types.LiveConnectConstraints(
                model=model,
                config=genai_types.LiveConnectConfig(**live_cfg_kwargs),
            ),
        )
        token = client.auth_tokens.create(config=config)
    except Exception as exc:
        return {
            "kind": "live_ephemeral_token",
            "ok": False,
            "error": "auth_token_create_failed",
            "detail": str(exc),
            "model": model,
            "response_modalities": modalities,
            "user_id": user_id,
            "room_id": room_id,
        }

    token_payload = _to_json_safe(token)
    token_name = ""
    if isinstance(token_payload, dict):
        token_name = str(token_payload.get("name", ""))
    if not token_name:
        token_name = str(getattr(token, "name", ""))

    return {
        "kind": "live_ephemeral_token",
        "ok": True,
        "token": token_payload,
        "token_name": token_name,
        "model": model,
        "response_modalities": modalities,
        "uses": uses_value,
        "expire_minutes": expire_minutes_value,
        "new_session_minutes": new_session_minutes_value,
        "issued_at": now.isoformat(),
        "user_id": user_id,
        "room_id": room_id,
    }


def _run_interaction_sync(requested: dict[str, Any], user_id: str, room_id: str) -> dict[str, Any]:
    client = _get_genai_client(INTERACTIONS_API_VERSION)
    if client is None:
        return {
            "kind": "interaction_response",
            "ok": False,
            "error": "gemini_client_unavailable",
            "detail": _genai_disabled_reason or "unknown",
            "user_id": user_id,
            "room_id": room_id,
        }

    input_data = requested.get("input")
    if not input_data:
        return {
            "kind": "interaction_response",
            "ok": False,
            "error": "input_required",
            "user_id": user_id,
            "room_id": room_id,
        }

    model = _normalize_model_name(
        str(requested.get("model", INTERACTIONS_MODEL)),
        INTERACTIONS_MODEL,
    )
    previous_interaction_id = str(requested.get("previous_interaction_id", "")).strip()
    store_history = _parse_bool(requested.get("store"), False)
    system_instruction = requested.get("system_instruction")

    kwargs: dict[str, Any] = {
        "api_version": INTERACTIONS_API_VERSION,
        "input": input_data,
        "model": model,
        "store": store_history,
    }
    if previous_interaction_id:
        kwargs["previous_interaction_id"] = previous_interaction_id
    if isinstance(system_instruction, str) and system_instruction.strip():
        kwargs["system_instruction"] = system_instruction.strip()

    generation_config: dict[str, Any] = {}
    temperature = requested.get("temperature")
    if isinstance(temperature, (int, float)):
        generation_config["temperature"] = float(temperature)
    max_output_tokens = requested.get("max_output_tokens")
    if isinstance(max_output_tokens, int) and max_output_tokens > 0:
        generation_config["max_output_tokens"] = max_output_tokens
    if generation_config:
        kwargs["generation_config"] = generation_config

    try:
        interaction = client.interactions.create(**kwargs)
    except Exception as exc:
        return {
            "kind": "interaction_response",
            "ok": False,
            "error": "interaction_create_failed",
            "detail": str(exc),
            "model": model,
            "user_id": user_id,
            "room_id": room_id,
        }

    raw = _to_json_safe(interaction)
    interaction_id = ""
    if isinstance(raw, dict):
        for key in ("id", "name", "interaction_id"):
            value = raw.get(key)
            if isinstance(value, str) and value.strip():
                interaction_id = value
                break

    fragments: list[str] = []
    _collect_text_fragments(raw, fragments)
    text = " ".join(dict.fromkeys(fragments))
    if len(text) > 1600:
        text = text[:1600]

    return {
        "kind": "interaction_response",
        "ok": True,
        "interaction_id": interaction_id,
        "model": model,
        "previous_interaction_id": previous_interaction_id,
        "store": store_history,
        "text": text,
        "raw": raw,
        "user_id": user_id,
        "room_id": room_id,
    }


async def _issue_ephemeral_token(
    requested: dict[str, Any], user_id: str, room_id: str
) -> dict[str, Any]:
    return await asyncio.to_thread(_issue_ephemeral_token_sync, requested, user_id, room_id)


async def _run_interaction(
    requested: dict[str, Any], user_id: str, room_id: str
) -> dict[str, Any]:
    return await asyncio.to_thread(_run_interaction_sync, requested, user_id, room_id)


def _user_profile_path(user_id: str) -> Path:
    return USER_RUNTIME_DIR / user_id / "profile.json"


def _default_user_profile(user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "player_name": user_id,
        "lang": lang,
        "total_matches": 0,
        "ai_memory_summary": "",
        "pending_milestone": 0,
        "robot": {
            "material": "wood",
            "level": 1,
            "personality": {"tone": "balanced"},
            "network": {"sync_rate": round(sync_rate, 3)},
        },
        "match_logs": [],
    }


def _load_user_profile(user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
    path = _user_profile_path(user_id)
    default_profile = _default_user_profile(user_id, lang, sync_rate)
    loaded: dict[str, Any] | None = _load_profile_from_firestore(user_id)

    if loaded is None and path.exists():
        try:
            local_loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(local_loaded, dict):
                loaded = local_loaded
        except Exception:
            loaded = None

    if loaded is None:
        return default_profile

    # Firestore payload uses recent_match_logs naming.
    if "recent_match_logs" in loaded and "match_logs" not in loaded:
        if isinstance(loaded.get("recent_match_logs"), list):
            loaded["match_logs"] = loaded.get("recent_match_logs")

    profile = default_profile | loaded
    robot = default_profile["robot"] | loaded.get("robot", {})
    personality = default_profile["robot"]["personality"] | robot.get("personality", {})
    network = default_profile["robot"]["network"] | robot.get("network", {})
    robot["personality"] = personality
    robot["network"] = network
    profile["robot"] = robot
    if not isinstance(profile.get("match_logs"), list):
        profile["match_logs"] = []
    return profile


def _save_user_profile(profile: dict[str, Any]) -> None:
    user_id = str(profile.get("user_id", "unknown"))
    path = _user_profile_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    _save_profile_to_firestore(profile)


def _public_profile_view(profile: dict[str, Any]) -> dict[str, Any]:
    robot = profile.get("robot", {})
    personality = robot.get("personality", {})
    network = robot.get("network", {})
    recent_logs_raw = profile.get("match_logs", [])
    if isinstance(recent_logs_raw, list):
        recent_logs = recent_logs_raw[-5:]
    else:
        recent_logs = []
    compact_logs: list[dict[str, Any]] = []
    for item in reversed(recent_logs):
        if not isinstance(item, dict):
            continue
        compact_logs.append(
            {
                "timestamp": item.get("timestamp"),
                "room_id": item.get("room_id"),
                "result": item.get("result"),
                "critical_hits": item.get("critical_hits", 0),
                "misses": item.get("misses", 0),
            }
        )
    return {
        "player_name": profile.get("player_name"),
        "total_matches": profile.get("total_matches"),
        "ai_memory_summary": profile.get("ai_memory_summary", ""),
        "tone": personality.get("tone", "balanced"),
        "sync_rate": network.get("sync_rate", 0.5),
        "recent_match_logs": compact_logs,
        "storage_backend": "firestore" if _get_firestore_client() is not None else "local",
    }


def _profile_sync_payload(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "target": user_id,
            "payload": {"kind": "profile_sync", "profile": _public_profile_view(profile)},
        },
    }


def _milestone_payload(user_id: str, total_matches: int) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "milestone_reached",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "milestone_notice",
                "total_matches": total_matches,
            },
        },
    }


def _append_memory_summary(existing: str, entry: str) -> str:
    base = (existing or "").strip()
    if not base:
        merged = entry
    else:
        merged = f"{base} | {entry}"
    if len(merged) <= MAX_MEMORY_SUMMARY_CHARS:
        return merged
    return merged[-MAX_MEMORY_SUMMARY_CHARS:]


def _ensure_runtime_state(room_id: str) -> dict[str, Any]:
    state = room_runtime_state.get(room_id)
    if state is not None:
        return state
    state = {
        "room_id": room_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "events": [],
        "sync_packets": 0,
        "per_user": defaultdict(lambda: {"sync_packets": 0, "events": 0}),
    }
    room_runtime_state[room_id] = state
    return state


def _record_room_sync(room_id: str, user_id: str, sync_data: dict[str, Any]) -> None:
    state = _ensure_runtime_state(room_id)
    state["sync_packets"] += 1
    state["per_user"][user_id]["sync_packets"] += 1
    state["per_user"][user_id]["last_action"] = sync_data.get("action")
    state["per_user"][user_id]["last_sync_ts"] = sync_data.get("timestamp")


def _record_room_event(room_id: str, user_id: str, event_data: dict[str, Any]) -> None:
    state = _ensure_runtime_state(room_id)
    state["per_user"][user_id]["events"] += 1
    state["events"].append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event_data.get("event", "unknown"),
            "user": user_id,
            "target": event_data.get("target"),
            "payload": event_data.get("payload"),
        }
    )
    if len(state["events"]) > 400:
        state["events"] = state["events"][-400:]


def _build_highlights(events: list[dict[str, Any]]) -> list[dict[str, str]]:
    highlights: list[dict[str, str]] = []
    for event in events:
        name = str(event.get("event", ""))
        if name in {"critical_hit", "milestone_reached", "item_dropped"}:
            highlights.append(
                {
                    "timestamp": str(event.get("timestamp", "")),
                    "description": f"{event.get('user')} triggered {name}",
                }
            )
    return highlights[:32]


def _finalize_room_runtime(room_id: str) -> None:
    state = room_runtime_state.pop(room_id, None)
    if not state:
        return

    ended_at = datetime.now(timezone.utc).isoformat()
    events = state.get("events", [])
    highlights = _build_highlights(events)
    per_user = {
        user_id: dict(metrics) for user_id, metrics in state.get("per_user", {}).items()
    }
    summary = {
        "room_id": room_id,
        "started_at": state.get("started_at"),
        "ended_at": ended_at,
        "total_events": len(events),
        "sync_packets": state.get("sync_packets", 0),
        "highlights": highlights,
        "per_user": per_user,
        "memory_summary": (
            f"{len(events)} events captured in-memory, {len(highlights)} highlights extracted."
        ),
    }

    MATCH_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_file = MATCH_LOG_DIR / f"{room_id}_{stamp}.json"
    out_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # Persist per-user memory bank and compact match logs (local fallback for Doc 6).
    for user_id, metrics in per_user.items():
        lang = str(metrics.get("lang", "en-US"))
        sync_rate = float(metrics.get("sync_rate", 0.5))
        profile = _load_user_profile(user_id, lang, sync_rate)

        critical_hits = int(metrics.get("critical_hits", 0))
        misses = int(metrics.get("misses", 0))
        if critical_hits > misses:
            result = "WIN"
        elif critical_hits < misses:
            result = "LOSE"
        else:
            result = "DRAW"

        user_highlights = [
            h for h in highlights if h.get("description", "").startswith(f"{user_id} ")
        ]
        memory_line = (
            f"{ended_at} {result}: critical={critical_hits}, miss={misses}, "
            f"room={room_id}, highlights={len(user_highlights)}"
        )

        profile["total_matches"] = int(profile.get("total_matches", 0)) + 1
        profile["lang"] = lang
        profile["ai_memory_summary"] = _append_memory_summary(
            str(profile.get("ai_memory_summary", "")), memory_line
        )

        robot = profile.get("robot", {})
        personality = robot.get("personality", {})
        network = robot.get("network", {})
        if "tone" in metrics:
            personality["tone"] = metrics["tone"]
        network["sync_rate"] = round(sync_rate, 3)
        robot["personality"] = personality
        robot["network"] = network
        profile["robot"] = robot

        match_log = {
            "timestamp": ended_at,
            "room_id": room_id,
            "result": result,
            "critical_hits": critical_hits,
            "misses": misses,
            "highlight_events": user_highlights,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=MATCH_LOG_TTL_DAYS)).isoformat(),
        }
        logs = profile.get("match_logs", [])
        if not isinstance(logs, list):
            logs = []
        logs.append(match_log)
        profile["match_logs"] = logs[-25:]

        if profile["total_matches"] % 5 == 0:
            profile["pending_milestone"] = profile["total_matches"]

        _save_user_profile(profile)
        _save_match_log_to_firestore(user_id, match_log)

        user_log_dir = USER_RUNTIME_DIR / user_id / "match_logs"
        user_log_dir.mkdir(parents=True, exist_ok=True)
        user_log_file = user_log_dir / f"{room_id}_{stamp}.json"
        user_log_file.write_text(json.dumps(match_log, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[MATCH] committed runtime summary room={room_id} file={out_file}")


def _cleanup_game_client(websocket: Any) -> bool:
    meta = game_clients.pop(websocket, None)
    if not meta:
        return False

    room_id = meta["room_id"]
    user_id = meta["user_id"]
    room_members[room_id].discard(websocket)
    room_user_meta.get(room_id, {}).pop(user_id, None)
    current = room_user_map.get(room_id, {}).get(user_id)
    if current is websocket:
        del room_user_map[room_id][user_id]
    if not room_members[room_id]:
        room_members.pop(room_id, None)
        room_user_map.pop(room_id, None)
        room_user_meta.pop(room_id, None)
        _finalize_room_runtime(room_id)
        return True
    return False


def _register_game_client(
    websocket: Any, user_id: str, room_id: str, lang: str, sync_rate: float
) -> None:
    existing = room_user_map.get(room_id, {}).get(user_id)
    if existing and existing is not websocket:
        _cleanup_game_client(existing)

    game_clients[websocket] = {
        "user_id": user_id,
        "room_id": room_id,
        "lang": lang,
        "sync_rate": sync_rate,
    }
    room_members[room_id].add(websocket)
    room_user_map[room_id][user_id] = websocket
    room_user_meta[room_id][user_id] = {"lang": lang, "sync_rate": sync_rate}
    state = _ensure_runtime_state(room_id)
    state["per_user"][user_id]["lang"] = lang
    state["per_user"][user_id]["sync_rate"] = round(sync_rate, 3)


def _room_peer_ids(room_id: str) -> list[str]:
    return sorted(room_user_map.get(room_id, {}).keys())


def _roster_payload(room_id: str) -> dict:
    return {
        "type": "signal",
        "data": {
            "kind": "roster",
            "from": "server",
            "peers": _room_peer_ids(room_id),
        },
    }


async def _broadcast_roster(room_id: str) -> None:
    await _broadcast_room(room_id, _roster_payload(room_id))


async def _broadcast_room(
    room_id: str,
    payload: dict,
    exclude: Any | None = None,
    target_user: str | None = None,
) -> None:
    text = json.dumps(payload, ensure_ascii=False)
    stale: list[Any] = []

    if target_user:
        ws = room_user_map.get(room_id, {}).get(target_user)
        if ws and ws is not exclude:
            try:
                await ws.send(text)
            except ConnectionClosed:
                stale.append(ws)
    else:
        for ws in list(room_members.get(room_id, set())):
            if ws is exclude:
                continue
            try:
                await ws.send(text)
            except ConnectionClosed:
                stale.append(ws)

    for ws in stale:
        _cleanup_game_client(ws)


def _initial_tactics_payload(lang: str) -> dict:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "payload": _localized_tactics(lang),
        },
    }


def _special_prompt_payload(user_id: str, lang: str) -> dict:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "incantation_prompt",
                "lang": lang,
                "text": _special_phrase_for_lang(lang),
            },
        },
    }


def _update_persona_tone(room_id: str, user_id: str, verdict: str, lang: str) -> Optional[dict]:
    state = _ensure_runtime_state(room_id)
    metrics = state["per_user"][user_id]
    critical_hits = int(metrics.get("critical_hits", 0))
    misses = int(metrics.get("misses", 0))
    old_tone = str(metrics.get("tone", "balanced"))

    if verdict == "critical":
        critical_hits += 1
    else:
        misses += 1

    delta = critical_hits - misses
    if delta >= 2:
        new_tone = "confident"
    elif delta <= -2:
        new_tone = "focused"
    else:
        new_tone = "balanced"

    metrics["critical_hits"] = critical_hits
    metrics["misses"] = misses
    metrics["tone"] = new_tone

    if new_tone == old_tone:
        return None

    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "persona_tone",
                "tone": new_tone,
                "message": _tone_message(lang, new_tone),
                "critical_hits": critical_hits,
                "misses": misses,
            },
        },
    }


async def _generate_fusion_texture(payload: dict[str, Any]) -> str:
    concept = str(payload.get("concept", "legendary weapon"))
    image_data = payload.get("reference_image")
    if isinstance(image_data, str):
        image_bytes = image_data.encode("utf-8")
    else:
        image_bytes = b""

    if reality_crafter is None:
        return f"https://praresar.storage/textures/fallback_{hash(concept)}.png"
    return await reality_crafter.generate_fused_item(image_bytes, concept)


def _score_pcm16_frame(chunk: bytes) -> tuple[float, float]:
    sample_count = len(chunk) // 2
    if sample_count == 0:
        return 0.0, 0.0
    view = memoryview(chunk).cast("h")
    abs_sum = 0
    peak = 0
    for sample in view:
        amp = abs(int(sample))
        abs_sum += amp
        if amp > peak:
            peak = amp
    avg = abs_sum / sample_count / 32767.0
    peak_norm = peak / 32767.0
    return avg, peak_norm


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _build_audio_result(
    frame_count: int,
    packet_count: int,
    elapsed_sec: float,
    avg_amplitude: float,
    peak_amplitude: float,
    sync_rate: float,
) -> dict:
    elapsed = max(elapsed_sec, 0.001)
    duration_score = _clamp01(frame_count / (16000 * 1.3))
    packet_rate = packet_count / elapsed

    accuracy = _clamp01(0.45 + 0.55 * duration_score)
    speed = _clamp01(packet_rate / 8.0)
    passion = _clamp01((avg_amplitude * 1.2) + (peak_amplitude * 0.35))

    base_total = (accuracy * 0.45) + (speed * 0.2) + (passion * 0.35)
    sync_bonus = (sync_rate - 0.5) * 0.16
    total = _clamp01(base_total + sync_bonus)
    critical_threshold = _clamp01(0.72 - (sync_rate * 0.08))
    verdict = "critical" if total >= critical_threshold else "miss"
    return {
        "accuracy": round(accuracy, 3),
        "speed": round(speed, 3),
        "passion": round(passion, 3),
        "sync_rate": round(sync_rate, 3),
        "critical_threshold": round(critical_threshold, 3),
        "score": round(total, 3),
        "verdict": verdict,
        "is_critical": verdict == "critical",
        "is_miss": verdict != "critical",
        "action": "heavy_attack" if verdict == "critical" else "stumble",
    }


async def handle_game_connection(websocket: Any, request_path: str) -> None:
    user_id, room_id, lang, sync_rate = _parse_game_identity(request_path)
    _register_game_client(websocket, user_id, room_id, lang, sync_rate)
    profile = _load_user_profile(user_id, lang, sync_rate)
    _save_user_profile(profile)
    print(
        f"[GAME] connected user={user_id} room={room_id} lang={lang} sync_rate={sync_rate:.2f} "
        f"room_clients={len(room_members.get(room_id, set()))}"
    )

    await websocket.send(json.dumps(_profile_sync_payload(user_id, profile), ensure_ascii=False))
    pending_milestone = int(profile.get("pending_milestone", 0))
    if pending_milestone > 0:
        await websocket.send(
            json.dumps(_milestone_payload(user_id, pending_milestone), ensure_ascii=False)
        )
        profile["pending_milestone"] = 0
        _save_user_profile(profile)

    await websocket.send(json.dumps(_initial_tactics_payload(lang), ensure_ascii=False))
    await websocket.send(json.dumps(_special_prompt_payload(user_id, lang), ensure_ascii=False))
    await websocket.send(json.dumps(_roster_payload(room_id), ensure_ascii=False))
    await _broadcast_roster(room_id)

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                continue
            payload = _safe_json_loads(message)
            if not payload:
                continue

            packet_type = payload.get("type")
            if packet_type not in {"sync", "event", "signal"}:
                continue

            if packet_type == "signal":
                signal_data = payload.get("data")
                if not isinstance(signal_data, dict):
                    continue
                signal_data["from"] = user_id
                payload["data"] = signal_data
                target_user = signal_data.get("to") if isinstance(signal_data, dict) else None

                kind = signal_data.get("kind")
                if kind in {"offer", "answer", "ice"} and not target_user:
                    continue

                await _broadcast_room(room_id, payload, exclude=websocket, target_user=target_user)
            elif packet_type == "sync":
                sync_data = payload.get("data")
                if isinstance(sync_data, dict):
                    sync_data["userId"] = user_id
                    payload["data"] = sync_data
                    _record_room_sync(room_id, user_id, sync_data)
                await _broadcast_room(room_id, payload, exclude=websocket)
            elif packet_type == "event":
                event_data = payload.get("data")
                if isinstance(event_data, dict):
                    event_data["user"] = user_id
                    payload["data"] = event_data
                    payload_obj = event_data.get("payload")

                    if (
                        event_data.get("event") == "request_ephemeral_token"
                        and isinstance(payload_obj, dict)
                    ):
                        token_result = await _issue_ephemeral_token(payload_obj, user_id, room_id)
                        token_result["request_id"] = payload_obj.get("request_id")
                        wrapped = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": user_id,
                                "payload": token_result,
                            },
                        }
                        await _broadcast_room(room_id, wrapped, target_user=user_id)
                        _record_room_event(room_id, user_id, wrapped["data"])
                        continue

                    if (
                        event_data.get("event") == "interaction_turn"
                        and isinstance(payload_obj, dict)
                    ):
                        interaction_result = await _run_interaction(payload_obj, user_id, room_id)
                        interaction_result["request_id"] = payload_obj.get("request_id")
                        wrapped = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": user_id,
                                "payload": interaction_result,
                            },
                        }
                        await _broadcast_room(room_id, wrapped, target_user=user_id)
                        _record_room_event(room_id, user_id, wrapped["data"])
                        continue

                    # Client-requested profile refresh (Doc 6 UI sync).
                    if (
                        event_data.get("event") == "buff_applied"
                        and isinstance(payload_obj, dict)
                        and payload_obj.get("kind") == "request_profile_sync"
                    ):
                        refreshed_profile = _load_user_profile(user_id, lang, sync_rate)
                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(user_id, refreshed_profile),
                            target_user=user_id,
                        )
                        continue

                    # Reality Fusion Craft (Doc 9): request -> async texture generation -> broadcast item event.
                    if (
                        event_data.get("event") == "item_dropped"
                        and isinstance(payload_obj, dict)
                        and bool(payload_obj.get("craft_request"))
                    ):
                        texture_url = await _generate_fusion_texture(payload_obj)
                        generated = {
                            "event": "item_dropped",
                            "user": "server",
                            "target": event_data.get("target"),
                            "payload": {
                                "kind": "fused_item",
                                "requested_by": user_id,
                                "concept": str(payload_obj.get("concept", "legendary item")),
                                "texture_url": texture_url,
                            },
                        }
                        wrapped = {"type": "event", "data": generated}
                        await _broadcast_room(room_id, wrapped)
                        _record_room_event(room_id, user_id, generated)
                        continue

                    _record_room_event(room_id, user_id, event_data)
                await _broadcast_room(room_id, payload, exclude=websocket)
            else:
                await _broadcast_room(room_id, payload, exclude=websocket)
    except ConnectionClosed:
        pass
    finally:
        _cleanup_game_client(websocket)
        await _broadcast_roster(room_id)
        print(
            f"[GAME] disconnected user={user_id} room={room_id} "
            f"room_clients={len(room_members.get(room_id, set()))}"
        )


async def handle_audio_connection(websocket: Any, request_path: str) -> None:
    user_id, room_id, lang, sync_rate = _parse_audio_identity(request_path)
    audio_gate_open = False
    source = "unknown"
    has_video_track = False
    video_frame_count = 0
    last_video_ts = 0
    sample_count = 0
    packet_count = 0
    amplitude_sum = 0.0
    peak_amplitude = 0.0
    start = time.monotonic()

    try:
        async for message in websocket:
            if isinstance(message, str):
                payload = _safe_json_loads(message) or {}
                cmd = payload.get("cmd")
                if cmd == "open_audio_gate":
                    audio_gate_open = True
                    source = str(payload.get("source", "unknown"))
                    has_video_track = bool(payload.get("has_video_track", False))
                    lang = str(payload.get("lang", lang or "en-US"))
                    user_id = str(payload.get("user_id", user_id))
                    room_id = str(payload.get("room_id", room_id))
                    try:
                        sync_rate = _clamp01(float(payload.get("sync_rate", sync_rate)))
                    except (TypeError, ValueError):
                        sync_rate = _clamp01(sync_rate)
                    start = time.monotonic()
                elif cmd == "video_frame":
                    video_frame_count += 1
                    ts = payload.get("ts", 0)
                    if isinstance(ts, (int, float)):
                        last_video_ts = int(ts)
                elif cmd == "close_audio_gate":
                    break
                continue

            if not audio_gate_open:
                continue

            avg, peak = _score_pcm16_frame(message)
            packet_count += 1
            sample_count += len(message) // 2
            amplitude_sum += avg
            if peak > peak_amplitude:
                peak_amplitude = peak

            elapsed = time.monotonic() - start
            if packet_count >= 12 or elapsed >= 2.4:
                break
    except ConnectionClosed:
        return

    elapsed = time.monotonic() - start
    mean_amplitude = amplitude_sum / max(packet_count, 1)
    result = _build_audio_result(
        frame_count=sample_count,
        packet_count=packet_count,
        elapsed_sec=elapsed,
        avg_amplitude=mean_amplitude,
        peak_amplitude=peak_amplitude,
        sync_rate=sync_rate,
    )
    battle_event = "critical_hit" if result["verdict"] == "critical" else "debuff_applied"
    result["source"] = source
    result["lang"] = lang
    result["room_id"] = room_id
    result["user_id"] = user_id
    result["has_video_track"] = has_video_track
    result["video_frame_count"] = video_frame_count
    result["last_video_ts"] = last_video_ts
    result["broadcasted"] = False

    if room_id in room_members and user_id:
        user_lang = str(room_user_meta.get(room_id, {}).get(user_id, {}).get("lang", lang))
        payload = {
            "type": "event",
            "data": {
                "event": battle_event,
                "user": user_id,
                "payload": result,
            },
        }
        await _broadcast_room(room_id, payload)
        _record_room_event(room_id, user_id, payload["data"])
        result["broadcasted"] = True

        tone_payload = _update_persona_tone(room_id, user_id, result["verdict"], user_lang)
        if tone_payload:
            await _broadcast_room(room_id, tone_payload, target_user=user_id)
            _record_room_event(room_id, user_id, tone_payload["data"])

    await websocket.send(json.dumps(result, ensure_ascii=False))


async def websocket_router(websocket: Any, path: Optional[str] = None) -> None:
    request_path = path or getattr(websocket, "path", "/")

    if request_path.startswith(GAME_PATH):
        await handle_game_connection(websocket, request_path)
        return

    if request_path.startswith(AUDIO_PATH):
        await handle_audio_connection(websocket, request_path)
        return

    if request_path.startswith(LIVE_PATH):
        if adk_live_handler is None:
            error = {
                "type": "error",
                "message": "ADK live handler unavailable",
                "detail": ADK_IMPORT_ERROR,
            }
            await websocket.send(json.dumps(error))
            return
        client_id = str(id(websocket))
        await adk_live_handler(client_id, websocket)
        return

    await websocket.send(json.dumps({"type": "error", "message": f"Unsupported path: {request_path}"}))


async def start_server() -> None:
    print("Starting PlaresAR Backend AI Core...")
    print(f"WebSocket server listening on ws://{HOST}:{PORT}")
    print(f"Routes: {GAME_PATH}, {AUDIO_PATH}, {LIVE_PATH}")
    async with websockets.serve(websocket_router, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(start_server())
