import asyncio
import json
import math
import os
import random
import re
import time
import uuid
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.exceptions import ConnectionClosed

from .utils import logger, to_json_safe, safe_json_loads, clamp01, to_float, to_int

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

try:
    from .streaming.bidi_session import handle_client_connection as adk_live_handler
except Exception as exc:  # pragma: no cover - import may fail in local envs
    adk_live_handler = None
    ADK_IMPORT_ERROR = str(exc)
    logger.error(f"ADK Import Error: {ADK_IMPORT_ERROR}")
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
    from ..infrastructure.multimodal_pipeline import RealityFusionCrafter, MilestoneVideoGenerator  # type: ignore
except Exception:
    try:
        from backend.infrastructure.multimodal_pipeline import RealityFusionCrafter, MilestoneVideoGenerator  # type: ignore
    except Exception:
        try:
            from infrastructure.multimodal_pipeline import RealityFusionCrafter, MilestoneVideoGenerator  # type: ignore
        except Exception:
            RealityFusionCrafter = None
            MilestoneVideoGenerator = None

try:
    from ..infrastructure.mcp_server import FirestoreMCPServer  # type: ignore
    from ..infrastructure.vertex_cache import VertexContextCache  # type: ignore
except Exception:
    try:
        from backend.infrastructure.mcp_server import FirestoreMCPServer  # type: ignore
        from backend.infrastructure.vertex_cache import VertexContextCache  # type: ignore
    except Exception:
        try:
            from infrastructure.mcp_server import FirestoreMCPServer  # type: ignore
            from infrastructure.vertex_cache import VertexContextCache  # type: ignore
        except Exception:
            FirestoreMCPServer = None
            VertexContextCache = None

try:
    from .character_generator import generate_robot_stats
except Exception:
    try:
        from ai_core.character_generator import generate_robot_stats
    except Exception:
        generate_robot_stats = None

mcp_server_instance = None
mcp_firestore_tools = None
vertex_cache_instance = None

if FirestoreMCPServer is not None:
    try:
        mcp_server_instance = FirestoreMCPServer(os.getenv("GCP_PROJECT", "plaresar"))
        mcp_firestore_tools = mcp_server_instance.register_firestore_tools()
    except Exception as e:
        logger.error(f"MCP init failed: {e}", exc_info=True)

if VertexContextCache is not None:
    try:
        vertex_cache_instance = VertexContextCache()
    except Exception as e:
        logger.error(f"Vertex cache init failed: {e}", exc_info=True)

if load_dotenv is not None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(env_path, override=False)

HOST = os.getenv("PLARES_HOST", "0.0.0.0")
PORT = int(os.getenv("PLARES_PORT", "8000"))
GAME_PATH = "/ws/game"
AUDIO_PATH = "/ws/audio"
LIVE_PATH = "/ws/live"
CHARACTER_PATH = "/ws/character"
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
    or "models/gemini-2.5-flash-native-audio-preview-12-2025"
)
INTERACTIONS_MODEL = (
    os.getenv("PLARES_INTERACTIONS_MODEL")
    or os.getenv("PLARES_LIGHT_MODEL")
    or "gemini-3-flash-preview"
)
# UI translation uses the lightest model available for cost efficiency.
UI_TRANSLATION_MODEL = (
    os.getenv("PLARES_UI_TRANSLATION_MODEL")
    or "gemini-flash-lite-latest"
)
EPHEMERAL_DEFAULT_USES = int(os.getenv("PLARES_EPHEMERAL_USES", "3"))
EPHEMERAL_EXPIRE_MINUTES = int(os.getenv("PLARES_EPHEMERAL_EXPIRE_MINUTES", "10"))
EPHEMERAL_NEW_SESSION_MINUTES = int(os.getenv("PLARES_EPHEMERAL_NEW_SESSION_MINUTES", "60"))
SYNC_MAX_SPEED_MPS = float(os.getenv("PLARES_SYNC_MAX_SPEED_MPS", "8.0"))
SYNC_MAX_WARP_DISTANCE = float(os.getenv("PLARES_SYNC_MAX_WARP_DISTANCE", "1.2"))
DISCONNECT_DETECT_SEC = float(os.getenv("PLARES_DISCONNECT_DETECT_SEC", "3.0"))
RECONNECT_GRACE_SEC = float(os.getenv("PLARES_RECONNECT_GRACE_SEC", "15.0"))
HEARTBEAT_MISS_SEC = float(os.getenv("PLARES_HEARTBEAT_MISS_SEC", "3.0"))
SPECTATOR_MAX_INTERVENTIONS = int(os.getenv("PLARES_SPECTATOR_MAX_INTERVENTIONS", "3"))
SPECTATOR_COOLDOWN_SEC = float(os.getenv("PLARES_SPECTATOR_COOLDOWN_SEC", "30.0"))
SPECTATOR_MAX_HP_RATIO = float(os.getenv("PLARES_SPECTATOR_MAX_HP_RATIO", "0.2"))
MATERIAL_DAMAGE_MULTIPLIER: dict[str, dict[str, float]] = {
    "Wood": {"Wood": 1.0, "Metal": 0.8, "Resin": 1.3},
    "Metal": {"Wood": 1.3, "Metal": 1.0, "Resin": 0.8},
    "Resin": {"Wood": 0.8, "Metal": 1.3, "Resin": 1.0},
}
EX_GAUGE_MAX = float(os.getenv("PLARES_EX_GAUGE_MAX", "100"))
EX_GAUGE_ON_HIT = float(os.getenv("PLARES_EX_GAUGE_ON_HIT", "8"))
EX_GAUGE_ON_CRITICAL = float(os.getenv("PLARES_EX_GAUGE_ON_CRITICAL", "16"))
EX_GAUGE_ON_HIT_RECEIVED = float(os.getenv("PLARES_EX_GAUGE_ON_HIT_RECEIVED", "12"))
EX_GAUGE_PER_SECOND = float(os.getenv("PLARES_EX_GAUGE_PER_SECOND", "1"))
REJECT_ITEM_DISTRUST_THRESHOLD = int(os.getenv("PLARES_REJECT_ITEM_DISTRUST_THRESHOLD", "3"))
PROACTIVE_LINE_MAX_CHARS = int(os.getenv("PLARES_PROACTIVE_LINE_MAX_CHARS", "15"))
BGM_READY_DELAY_SEC = float(os.getenv("PLARES_BGM_READY_DELAY_SEC", "0.2"))
DNA_EVOLUTION_MATCH_STEP = int(os.getenv("PLARES_DNA_EVOLUTION_MATCH_STEP", "5"))
CRITICAL_THRESHOLD_BASE = float(
    os.getenv(
        "PLARES_CRITICAL_THRESHOLD",
        os.getenv("PLARES_CRITICAL_THRESHOLD_BASE", "0.72"),
    )
)
SYNC_BONUS_FACTOR = float(
    os.getenv(
        "PLARES_SYNC_BONUS",
        os.getenv("PLARES_SYNC_BONUS_FACTOR", "0.16"),
    )
)
SYNC_THRESHOLD_FACTOR = float(os.getenv("PLARES_SYNC_THRESHOLD_FACTOR", "0.08"))

game_clients: dict[Any, dict[str, Any]] = {}
room_members: dict[str, set[Any]] = defaultdict(set)
room_user_map: dict[str, dict[str, Any]] = defaultdict(dict)
room_user_meta: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
room_runtime_state: dict[str, dict[str, Any]] = {}
room_disconnect_tasks: dict[tuple[str, str], asyncio.Task[Any]] = {}
reality_crafter = RealityFusionCrafter() if RealityFusionCrafter is not None else None
milestone_generator = MilestoneVideoGenerator(project_id=os.getenv("GCP_PROJECT", "plaresar")) if MilestoneVideoGenerator is not None else None
_firestore_client: Any | None = None
_firestore_disabled_reason: str = ""
_genai_clients: dict[str, Any] = {}
_genai_disabled_reason: str = ""


def _sanitize_id(val: str) -> str:
    """Sanitize identifier for safe path construction to prevent path traversal."""
    return re.sub(r'[^a-zA-Z0-9_-]', '_', str(val))


def _default_character_dna(material: str = "Wood", tone: str = "balanced") -> dict[str, Any]:
    palette_by_material = {
        "Wood": "ember",
        "Metal": "marine",
        "Resin": "forest",
    }
    tone_l = str(tone).lower()
    palette = palette_by_material.get(_normalize_material(material), "marine")
    if "cool" in tone_l or "冷静" in tone_l:
        palette = "marine"
    elif "aggressive" in tone_l or "熱血" in tone_l:
        palette = "ember"
    elif "関西" in tone_l or "fun" in tone_l:
        palette = "sunset"
    eye_glow_by_palette = {
        "ember": "#FFB86E",
        "marine": "#73E4FF",
        "forest": "#9BFFD2",
        "royal": "#C8C7FF",
        "obsidian": "#95E5FF",
        "sunset": "#FFCAA0",
    }
    return {
        "version": "v1",
        "seed": abs(hash(f"{material}|{tone}")) % (2**31),
        "silhouette": "ace",
        "finish": "satin",
        "paletteFamily": palette,
        "eyeGlow": eye_glow_by_palette.get(palette, "#73E4FF"),
        "scarLevel": 0,
        "glowIntensity": 1.0,
        "evolutionStage": 0,
        "battlePatina": "clean",
    }


def _normalize_character_dna(raw: Any, *, material: str = "Wood", tone: str = "balanced") -> dict[str, Any]:
    base = _default_character_dna(material, tone)
    if not isinstance(raw, dict):
        return base

    dna = dict(base)
    dna["version"] = "v1"
    try:
      dna["seed"] = max(1, int(raw.get("seed", base["seed"])))
    except (TypeError, ValueError):
      dna["seed"] = base["seed"]

    silhouette = str(raw.get("silhouette", base["silhouette"]))
    if silhouette not in {"striker", "tank", "ace"}:
        silhouette = base["silhouette"]
    dna["silhouette"] = silhouette

    finish = str(raw.get("finish", base["finish"]))
    if finish not in {"matte", "satin", "gloss"}:
        finish = base["finish"]
    dna["finish"] = finish

    palette = str(raw.get("paletteFamily", base["paletteFamily"]))
    if palette not in {"ember", "marine", "forest", "royal", "obsidian", "sunset"}:
        palette = base["paletteFamily"]
    dna["paletteFamily"] = palette
    dna["eyeGlow"] = str(raw.get("eyeGlow", base["eyeGlow"]))[:16]

    try:
        dna["scarLevel"] = max(0, min(3, int(raw.get("scarLevel", base["scarLevel"]))))
    except (TypeError, ValueError):
        dna["scarLevel"] = base["scarLevel"]

    try:
        dna["glowIntensity"] = max(0.8, min(1.8, float(raw.get("glowIntensity", base["glowIntensity"]))))
    except (TypeError, ValueError):
        dna["glowIntensity"] = base["glowIntensity"]

    try:
        dna["evolutionStage"] = max(0, int(raw.get("evolutionStage", base["evolutionStage"])))
    except (TypeError, ValueError):
        dna["evolutionStage"] = base["evolutionStage"]

    patina = str(raw.get("battlePatina", base["battlePatina"]))
    if patina not in {"clean", "worn", "scarred", "legend"}:
        patina = "clean"
    dna["battlePatina"] = patina
    return dna


def _evolve_character_dna_by_matches(dna: dict[str, Any], total_matches: int) -> dict[str, Any]:
    stage_step = max(1, DNA_EVOLUTION_MATCH_STEP)
    stage = max(0, int(total_matches) // stage_step)
    scar_level = max(0, min(3, stage))
    glow_intensity = max(1.0, min(1.8, 1.0 + (stage * 0.12)))
    if stage >= 3:
        patina = "legend"
    elif stage >= 2:
        patina = "scarred"
    elif stage >= 1:
        patina = "worn"
    else:
        patina = "clean"

    evolved = dict(dna)
    evolved["evolutionStage"] = stage
    evolved["scarLevel"] = scar_level
    evolved["glowIntensity"] = round(glow_intensity, 3)
    evolved["battlePatina"] = patina
    return evolved


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
        return clamp01(float(raw))
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
            "distrustful": "機体の口調がやさぐれた",
            "kansai_okan": "機体の口調が関西のオカン化",
        }
    elif bucket == "es":
        messages = {
            "focused": "El tono cambio a modo concentrado",
            "balanced": "El tono volvio al modo equilibrado",
            "confident": "El tono cambio a modo confiado",
            "distrustful": "El tono se volvio desconfiado",
            "kansai_okan": "El tono cambio a estilo Kansai",
        }
    else:
        messages = {
            "focused": "Persona tone shifted to focused mode",
            "balanced": "Persona tone returned to balanced mode",
            "confident": "Persona tone shifted to confident mode",
            "distrustful": "Persona tone drifted to distrustful mode",
            "kansai_okan": "Persona tone shifted to Kansai mom style",
        }
    if tone in messages:
        return messages[tone]
    if bucket == "ja":
        return f"機体の口調が「{tone}」に変化"
    if bucket == "es":
        return f"El tono cambio a '{tone}'"
    return f"Persona tone shifted to '{tone}'"


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
        snap = db.collection("users").document(_sanitize_id(user_id)).get()
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
        training_logs = profile.get("training_logs", [])
        walk_logs = profile.get("walk_logs", [])
        dna_ab_tests = profile.get("dna_ab_tests", [])
        recent = logs[-5:] if isinstance(logs, list) else []
        recent_training = training_logs[-5:] if isinstance(training_logs, list) else []
        recent_walk = walk_logs[-5:] if isinstance(walk_logs, list) else []
        recent_ab = dna_ab_tests[-10:] if isinstance(dna_ab_tests, list) else []
        payload = {
            "player_name": profile.get("player_name"),
            "lang": profile.get("lang"),
            "total_matches": profile.get("total_matches", 0),
            "ai_memory_summary": profile.get("ai_memory_summary", ""),
            "pending_milestone": profile.get("pending_milestone", 0),
            "robot": robot,
            "recent_match_logs": recent,
            "recent_training_logs": recent_training,
            "recent_walk_logs": recent_walk,
            "recent_dna_ab_tests": recent_ab,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        db.collection("users").document(_sanitize_id(user_id)).set(payload, merge=True)
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
        db.collection("users").document(_sanitize_id(user_id)).collection("matchLogs").document(_sanitize_id(doc_id)).set(payload)
    except Exception:
        return


def _resolve_gemini_api_key() -> str:
    """
    Resolve API key from GEMINI_API_KEY only.
    If legacy GOOGLE_API_KEY is also set, remove it to avoid SDK-side precedence.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key and os.getenv("GOOGLE_API_KEY"):
        os.environ.pop("GOOGLE_API_KEY", None)
    return api_key


def _get_genai_client(api_version: str) -> Any | None:
    global _genai_disabled_reason
    cached = _genai_clients.get(api_version)
    if cached is not None:
        return cached
    if genai is None or genai_types is None:
        _genai_disabled_reason = "google_genai_unavailable"
        return None
    api_key = _resolve_gemini_api_key()
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

    token_payload = to_json_safe(token)
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
        
    if mcp_firestore_tools and user_id:
        kwargs["tools"] = [mcp_firestore_tools]
        
    if vertex_cache_instance:
        cache_id = vertex_cache_instance.get_cache_for_user(user_id)
        if cache_id:
            kwargs["cached_content"] = cache_id

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

    raw = to_json_safe(interaction)
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
    return USER_RUNTIME_DIR / _sanitize_id(user_id) / "profile.json"


def _default_user_profile(user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "player_name": user_id,
        "lang": lang,
        "total_matches": 0,
        "ai_memory_summary": "",
        "pending_milestone": 0,
        "robot": {
            "name": "Plares Unit",
            "material": "Wood",
            "level": 1,
            "stats": {"power": 40, "speed": 40, "vit": 40},
            "personality": {"talk_skill": 50, "adlib_skill": 50, "tone": "balanced"},
            "network": {"sync_rate": round(sync_rate, 3), "unison": 100.0},
            "character_dna": _default_character_dna("Wood", "balanced"),
        },
        "match_logs": [],
        "training_logs": [],
        "walk_logs": [],
        "dna_ab_tests": [],
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
    if "recent_training_logs" in loaded and "training_logs" not in loaded:
        if isinstance(loaded.get("recent_training_logs"), list):
            loaded["training_logs"] = loaded.get("recent_training_logs")
    if "recent_walk_logs" in loaded and "walk_logs" not in loaded:
        if isinstance(loaded.get("recent_walk_logs"), list):
            loaded["walk_logs"] = loaded.get("recent_walk_logs")
    if "recent_dna_ab_tests" in loaded and "dna_ab_tests" not in loaded:
        if isinstance(loaded.get("recent_dna_ab_tests"), list):
            loaded["dna_ab_tests"] = loaded.get("recent_dna_ab_tests")

    profile = default_profile | loaded
    robot = default_profile["robot"] | loaded.get("robot", {})
    stats = default_profile["robot"]["stats"] | robot.get("stats", {})
    personality = default_profile["robot"]["personality"] | robot.get("personality", {})
    network = default_profile["robot"]["network"] | robot.get("network", {})
    material = str(robot.get("material", "Wood")).strip().capitalize()
    if material not in {"Wood", "Metal", "Resin"}:
        material = "Wood"
    robot["material"] = material
    robot["stats"] = stats
    robot["personality"] = personality
    robot["network"] = network
    robot["character_dna"] = _evolve_character_dna_by_matches(
        _normalize_character_dna(
            robot.get("character_dna"),
            material=material,
            tone=str(personality.get("tone", "balanced")),
        ),
        int(profile.get("total_matches", 0)),
    )
    profile["robot"] = robot
    if not isinstance(profile.get("match_logs"), list):
        profile["match_logs"] = []
    if not isinstance(profile.get("training_logs"), list):
        profile["training_logs"] = []
    if not isinstance(profile.get("walk_logs"), list):
        profile["walk_logs"] = []
    if not isinstance(profile.get("dna_ab_tests"), list):
        profile["dna_ab_tests"] = []
    return profile


def _save_user_profile(profile: dict[str, Any]) -> None:
    user_id = str(profile.get("user_id", "unknown"))
    path = _user_profile_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    _save_profile_to_firestore(profile)


def _append_mode_log(
    *,
    user_id: str,
    lang: str,
    sync_rate: float,
    mode: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    profile = _load_user_profile(user_id, lang, sync_rate)
    now = datetime.now(timezone.utc).isoformat()
    robot = profile.get("robot", {})
    personality = robot.get("personality", {}) if isinstance(robot, dict) else {}
    network = robot.get("network", {}) if isinstance(robot, dict) else {}

    if not isinstance(personality, dict):
        personality = {}
    if not isinstance(network, dict):
        network = {}

    sync_before = round(clamp01(to_float(network.get("sync_rate", sync_rate), sync_rate)), 3)
    raw_sync_after = payload.get(
        "syncRateAfter",
        payload.get("sync_rate_after", payload.get("syncRate", payload.get("sync_rate"))),
    )
    sync_after = sync_before
    if raw_sync_after is not None:
        sync_after = round(clamp01(to_float(raw_sync_after, sync_before)), 3)
    network["sync_rate"] = sync_after

    raw_tone = payload.get("tone")
    if raw_tone is not None:
        tone = str(raw_tone).strip()
        if tone:
            personality["tone"] = tone

    robot["personality"] = personality
    robot["network"] = network
    profile["robot"] = robot

    if mode == "training":
        session_id = str(payload.get("sessionId") or payload.get("session_id") or f"training_{uuid.uuid4().hex[:10]}")
        started_at = _safe_timestamp(payload.get("startedAt", payload.get("started_at", now)), now)
        ended_at = _safe_timestamp(payload.get("endedAt", payload.get("ended_at", now)), now)
        accuracy_score = clamp01(
            to_float(payload.get("accuracyScore", payload.get("accuracy_score", payload.get("accuracy"))), 0.0)
        )
        speed_score = clamp01(
            to_float(payload.get("speedScore", payload.get("speed_score", payload.get("speed"))), 0.0)
        )
        passion_score = clamp01(
            to_float(payload.get("passionScore", payload.get("passion_score", payload.get("passion"))), 0.0)
        )
        result_raw = str(payload.get("result", "SUCCESS")).strip().upper()
        if result_raw in {"SUCCESS", "WIN", "CRITICAL"}:
            result = "SUCCESS"
        elif result_raw in {"FAILURE", "LOSE", "MISS"}:
            result = "FAILURE"
        else:
            result = "SUCCESS"
        highlights = _to_string_list(payload.get("highlights", []), max_items=8)
        ai_comment = str(payload.get("aiComment", payload.get("ai_comment", ""))).strip()
        entry = {
            "timestamp": now,
            "session_id": session_id,
            "started_at": started_at,
            "ended_at": ended_at,
            "mode": "training",
            "sync_rate_before": sync_before,
            "sync_rate_after": sync_after,
            "result": result,
            "drill_type": str(payload.get("drillType", payload.get("drill_type", "voice_reaction"))),
            "accuracy_score": round(accuracy_score, 3),
            "speed_score": round(speed_score, 3),
            "passion_score": round(passion_score, 3),
            "accuracy": round(to_float(payload.get("accuracy", accuracy_score), accuracy_score), 3),
            "speed": round(to_float(payload.get("speed", speed_score), speed_score), 3),
            "passion": round(to_float(payload.get("passion", passion_score), passion_score), 3),
            "retry_count": to_int(payload.get("retryCount", payload.get("retry_count", 0)), 0),
            "highlights": highlights,
            "ai_comment": ai_comment,
            "highlight_events": _normalize_highlight_events(
                payload.get("highlight_events", payload.get("highlightEvents", []))
            ),
        }
        logs = profile.get("training_logs", [])
        if not isinstance(logs, list):
            logs = []
        logs.append(entry)
        profile["training_logs"] = logs[-50:]
        profile["ai_memory_summary"] = _append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            (
                f"{now} training#{session_id}: sync {sync_before:.2f}->{sync_after:.2f}, "
                f"acc={entry['accuracy_score']:.2f}, spd={entry['speed_score']:.2f}, pas={entry['passion_score']:.2f}"
            ),
        )
    elif mode == "walk":
        session_id = str(payload.get("sessionId") or payload.get("session_id") or f"walk_{uuid.uuid4().hex[:10]}")
        started_at = _safe_timestamp(payload.get("startedAt", payload.get("started_at", now)), now)
        ended_at = _safe_timestamp(payload.get("endedAt", payload.get("ended_at", now)), now)
        found_items = _to_string_list(payload.get("foundItems", payload.get("found_items", [])))
        proactive = _to_string_list(
            payload.get(
                "proactiveAudioHighlights",
                payload.get("proactive_audio_highlights", payload.get("proactiveLines", [])),
            )
        )
        vision_triggers = _to_string_list(
            payload.get("visionTriggers", payload.get("vision_triggers", [])),
            max_items=12,
        )
        ai_comment = str(payload.get("aiComment", payload.get("ai_comment", ""))).strip()
        entry = {
            "timestamp": now,
            "session_id": session_id,
            "mode": "walk",
            "started_at": started_at,
            "ended_at": ended_at,
            "sync_rate_before": sync_before,
            "sync_rate_after": sync_after,
            "route_summary": str(payload.get("routeSummary", "walk session")),
            "found_items": found_items,
            "proactive_audio_highlights": proactive,
            "vision_triggers": vision_triggers,
            "ai_comment": ai_comment,
            "highlight_events": _normalize_highlight_events(
                payload.get("highlight_events", payload.get("highlightEvents", []))
            ),
        }
        logs = profile.get("walk_logs", [])
        if not isinstance(logs, list):
            logs = []
        logs.append(entry)
        profile["walk_logs"] = logs[-50:]
        profile["ai_memory_summary"] = _append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            (
                f"{now} walk#{session_id}: sync {sync_before:.2f}->{sync_after:.2f}, "
                f"items={len(entry['found_items'])}, reflections={len(entry['proactive_audio_highlights'])}"
            ),
        )

    _save_user_profile(profile)
    return profile


def _public_profile_view(profile: dict[str, Any]) -> dict[str, Any]:
    robot = profile.get("robot", {})
    personality = robot.get("personality", {})
    network = robot.get("network", {})
    recent_logs_raw = profile.get("match_logs", [])
    training_logs_raw = profile.get("training_logs", [])
    walk_logs_raw = profile.get("walk_logs", [])
    dna_ab_tests_raw = profile.get("dna_ab_tests", [])
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
    training_count = len(training_logs_raw) if isinstance(training_logs_raw, list) else 0
    walk_count = len(walk_logs_raw) if isinstance(walk_logs_raw, list) else 0
    recent_ab_tests = dna_ab_tests_raw[-10:] if isinstance(dna_ab_tests_raw, list) else []
    return {
        "player_name": profile.get("player_name"),
        "total_matches": profile.get("total_matches"),
        "total_training_sessions": training_count,
        "total_walk_sessions": walk_count,
        "ai_memory_summary": profile.get("ai_memory_summary", ""),
        "tone": personality.get("tone", "balanced"),
        "sync_rate": network.get("sync_rate", 0.5),
        "recent_match_logs": compact_logs,
        "storage_backend": "firestore" if _get_firestore_client() is not None else "local",
        "character_dna": _normalize_character_dna(
            robot.get("character_dna"),
            material=str(robot.get("material", "Wood")),
            tone=str(personality.get("tone", "balanced")),
        ),
        "robot_stats": robot.get("stats", {}),
        "robot_material": str(robot.get("material", "Wood")),
        "recent_dna_ab_tests": recent_ab_tests,
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


def _to_string_list(value: Any, max_items: int = 20) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if not text:
            continue
        out.append(text)
        if len(out) >= max_items:
            break
    return out


def _normalize_highlight_events(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw[:20]:
        if not isinstance(item, dict):
            continue
        ts = str(item.get("timestamp", "")).strip()
        desc = str(item.get("description", "")).strip()
        if not ts and not desc:
            continue
        out.append({"timestamp": ts, "description": desc})
    return out


def _safe_timestamp(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    return text


def _summarize_memory_summary(
    *,
    existing_summary: str,
    memory_line: str,
    user_highlights: list[dict[str, str]],
    lang: str,
    tone: str,
    sync_rate: float,
) -> str:
    fallback = _append_memory_summary(existing_summary, memory_line)
    client = _get_genai_client(INTERACTIONS_API_VERSION)
    if client is None:
        return fallback

    highlights_text = "\n".join(
        f"- {item.get('timestamp', '')}: {item.get('description', '')}"
        for item in user_highlights[:8]
    )
    if not highlights_text:
        highlights_text = "- (none)"

    prompt = (
        "You are updating a long-term companion memory for an AR robot battle game.\n"
        f"Output plain text only, max {MAX_MEMORY_SUMMARY_CHARS} chars.\n"
        "Keep emotional continuity and growth trajectory over time.\n"
        f"Player language: {lang}\n"
        f"Robot tone at end of match: {tone}\n"
        f"Sync rate: {sync_rate:.3f}\n\n"
        "Existing memory summary:\n"
        f"{existing_summary or '(empty)'}\n\n"
        "New match facts:\n"
        f"- {memory_line}\n"
        "Key highlights:\n"
        f"{highlights_text}\n\n"
        "Return the updated memory summary."
    )
    model = _normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
        raw = to_json_safe(response)
        fragments: list[str] = []
        _collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments)).strip()
        if not text:
            return fallback
        if len(text) <= MAX_MEMORY_SUMMARY_CHARS:
            return text
        return text[-MAX_MEMORY_SUMMARY_CHARS:]
    except Exception:
        return fallback


def _ensure_runtime_state(room_id: str) -> dict[str, Any]:
    state = room_runtime_state.get(room_id)
    if state is not None:
        return state
    state = {
        "room_id": room_id,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "events": [],
        "sync_packets": 0,
        "spectator_interventions": 0,
        "spectator_cooldown_until": 0.0,
        "paused": False,
        "pause_reason": "",
        "combatants": [],
        "per_user": defaultdict(lambda: {"sync_packets": 0, "events": 0}),
    }
    room_runtime_state[room_id] = state
    return state


def _seed_runtime_state_from_room_meta(room_id: str) -> None:
    room_meta = room_user_meta.get(room_id, {})
    if not room_meta:
        return
    state = _ensure_runtime_state(room_id)
    for user_id, meta in room_meta.items():
        user_state = state["per_user"][user_id]
        user_state["lang"] = str(meta.get("lang", "en-US"))
        try:
            user_state["sync_rate"] = clamp01(float(meta.get("sync_rate", 0.5)))
        except (TypeError, ValueError):
            user_state["sync_rate"] = 0.5
        user_state["last_heartbeat"] = time.monotonic()

def _mark_user_heartbeat(room_id: str, user_id: str) -> None:
    state = _ensure_runtime_state(room_id)
    state["per_user"][user_id]["last_heartbeat"] = time.monotonic()
    if user_id in room_user_meta.get(room_id, {}):
        room_user_meta[room_id][user_id]["last_heartbeat"] = time.monotonic()


def _distance_xyz(a: dict[str, Any], b: dict[str, Any]) -> float:
    try:
        dx = float(a.get("x", 0.0)) - float(b.get("x", 0.0))
        dy = float(a.get("y", 0.0)) - float(b.get("y", 0.0))
        dz = float(a.get("z", 0.0)) - float(b.get("z", 0.0))
    except (TypeError, ValueError):
        return 0.0
    return math.sqrt((dx * dx) + (dy * dy) + (dz * dz))


def _validate_sync_packet(
    room_id: str,
    user_id: str,
    sync_data: dict[str, Any],
) -> tuple[bool, dict[str, Any] | None]:
    state = _ensure_runtime_state(room_id)
    metrics = state["per_user"][user_id]
    current_pos = sync_data.get("position")
    if not isinstance(current_pos, dict):
        return False, {
            "kind": "state_correction",
            "message": "Invalid sync payload: position missing",
            "position": metrics.get("last_position", {"x": 0.0, "y": 0.0, "z": 0.0}),
        }

    now = time.monotonic()
    last_pos = metrics.get("last_position")
    last_server_recv = metrics.get("last_server_recv")
    if not isinstance(last_pos, dict) or not isinstance(last_server_recv, (int, float)):
        metrics["last_position"] = current_pos
        metrics["last_server_recv"] = now
        return True, None

    dt = max(0.001, now - float(last_server_recv))
    dist = _distance_xyz(current_pos, last_pos)
    speed = dist / dt
    if dist > SYNC_MAX_WARP_DISTANCE or speed > SYNC_MAX_SPEED_MPS:
        return False, {
            "kind": "state_correction",
            "message": (
                f"Sync corrected (dist={dist:.2f}m, speed={speed:.2f}m/s exceeds limit)"
            ),
            "reason": "movement_outlier",
            "position": last_pos,
            "stats": {
                "distance": round(dist, 3),
                "speed": round(speed, 3),
                "max_speed": round(SYNC_MAX_SPEED_MPS, 3),
                "max_distance": round(SYNC_MAX_WARP_DISTANCE, 3),
            },
        }

    metrics["last_position"] = current_pos
    metrics["last_server_recv"] = now
    return True, None


def _record_room_sync(room_id: str, user_id: str, sync_data: dict[str, Any]) -> None:
    state = _ensure_runtime_state(room_id)
    state["sync_packets"] += 1
    state["per_user"][user_id]["sync_packets"] += 1
    state["per_user"][user_id]["last_action"] = sync_data.get("action")
    state["per_user"][user_id]["last_sync_ts"] = sync_data.get("timestamp")
    _mark_user_heartbeat(room_id, user_id)


def _record_room_event(room_id: str, user_id: str, event_data: dict[str, Any]) -> None:
    state = _ensure_runtime_state(room_id)
    state["per_user"][user_id]["events"] += 1
    _mark_user_heartbeat(room_id, user_id)
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


def _generate_global_match_summary(events: list[dict[str, Any]], highlights: list[dict[str, str]]) -> str:
    fallback = f"{len(events)} events captured in-memory, {len(highlights)} highlights extracted."
    client = _get_genai_client(INTERACTIONS_API_VERSION)
    if client is None or not highlights:
        return fallback

    highlights_text = "\n".join(f"- {h.get('timestamp', '')}: {h.get('description', '')}" for h in highlights[:15])
    prompt = (
        "You are an AI summarizing an AR robot battle match.\n"
        "Provide a short, thrilling 1-paragraph summary of the match based on these highlights:\n"
        f"{highlights_text}\n\n"
        "Output plain text only."
    )
    model = _normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
        raw = to_json_safe(response)
        fragments: list[str] = []
        _collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments)).strip()
        return text if text else fallback
    except Exception:
        return fallback


def _finalize_room_runtime(
    room_id: str,
    trigger: str = "room_empty",
    forced_results: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    state = room_runtime_state.pop(room_id, None)
    if not state:
        return []

    ended_at = datetime.now(timezone.utc).isoformat()
    events = state.get("events", [])
    highlights = _build_highlights(events)
    per_user = {
        user_id: dict(metrics) for user_id, metrics in state.get("per_user", {}).items()
    }
    sync_packets = int(state.get("sync_packets", 0))
    if sync_packets <= 0 and len(events) == 0:
        logger.info(f"[MATCH] skipped empty commit room={room_id} trigger={trigger}")
        return []

    summary = {
        "room_id": room_id,
        "started_at": state.get("started_at"),
        "ended_at": ended_at,
        "total_events": len(events),
        "sync_packets": sync_packets,
        "highlights": highlights,
        "per_user": per_user,
        "memory_summary": _generate_global_match_summary(events, highlights),
    }

    MATCH_LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_room_id = _sanitize_id(room_id)
    out_file = MATCH_LOG_DIR / f"{safe_room_id}_{stamp}.json"
    out_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # Persist per-user memory bank and compact match logs (local fallback for Doc 6).
    memory_updates: list[dict[str, Any]] = []
    for user_id, metrics in per_user.items():
        lang = str(metrics.get("lang", "en-US"))
        sync_rate = float(metrics.get("sync_rate", 0.5))
        profile = _load_user_profile(user_id, lang, sync_rate)

        critical_hits = int(metrics.get("critical_hits", 0))
        misses = int(metrics.get("misses", 0))
        forced = (forced_results or {}).get(user_id)
        if forced in {"WIN", "LOSE", "DRAW"}:
            result = forced
        elif critical_hits > misses:
            result = "WIN"
        elif critical_hits < misses:
            result = "LOSE"
        else:
            result = "DRAW"

        user_highlights = [
            h for h in highlights if h.get("description", "").startswith(f"{user_id} ")
        ]
        tone = str(metrics.get("tone", profile.get("robot", {}).get("personality", {}).get("tone", "balanced")))
        audio_metrics = metrics.get("last_audio") if isinstance(metrics.get("last_audio"), dict) else {}
        audio_fragment = ""
        if audio_metrics:
            audio_fragment = (
                f", audio(acc={audio_metrics.get('accuracy', 0)}, "
                f"spd={audio_metrics.get('speed', 0)}, "
                f"pas={audio_metrics.get('passion', 0)})"
            )
        memory_line = (
            f"{ended_at} {result}: critical={critical_hits}, miss={misses}, "
            f"room={room_id}, highlights={len(user_highlights)}{audio_fragment}"
        )

        profile["total_matches"] = int(profile.get("total_matches", 0)) + 1
        profile["lang"] = lang
        profile["ai_memory_summary"] = _summarize_memory_summary(
            existing_summary=str(profile.get("ai_memory_summary", "")),
            memory_line=memory_line,
            user_highlights=user_highlights,
            lang=lang,
            tone=tone,
            sync_rate=sync_rate,
        )

        robot = profile.get("robot", {})
        personality = robot.get("personality", {})
        network = robot.get("network", {})
        material = _normalize_material(robot.get("material", "Wood"))
        if "tone" in metrics:
            personality["tone"] = metrics["tone"]
        network["sync_rate"] = round(sync_rate, 3)
        robot["character_dna"] = _evolve_character_dna_by_matches(
            _normalize_character_dna(
                robot.get("character_dna"),
                material=material,
                tone=str(personality.get("tone", "balanced")),
            ),
            int(profile["total_matches"]),
        )
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

        if milestone_generator is not None:
            if result == "WIN":
                asyncio.create_task(milestone_generator.trigger_victory_music(user_id, str(profile.get("ai_memory_summary", ""))))
            asyncio.create_task(milestone_generator.check_and_generate_highlight_reel(profile["total_matches"], user_id))

        user_log_dir = USER_RUNTIME_DIR / _sanitize_id(user_id) / "match_logs"
        user_log_dir.mkdir(parents=True, exist_ok=True)
        user_log_file = user_log_dir / f"{safe_room_id}_{stamp}.json"
        user_log_file.write_text(json.dumps(match_log, ensure_ascii=False, indent=2), encoding="utf-8")
        memory_updates.append(
            {
                "user_id": user_id,
                "timestamp": ended_at,
                "room_id": room_id,
                "result": result,
                "total_matches": profile["total_matches"],
                "ai_memory_summary": profile["ai_memory_summary"],
            }
        )

    logger.info(f"[MATCH] committed runtime summary room={room_id} trigger={trigger} file={out_file}")
    return memory_updates


def _cancel_disconnect_task(room_id: str, user_id: str) -> None:
    key = (room_id, user_id)
    task = room_disconnect_tasks.pop(key, None)
    if task and not task.done():
        task.cancel()


def _consume_spectator_intervention(room_id: str) -> tuple[bool, str, float]:
    state = _ensure_runtime_state(room_id)
    now = time.monotonic()
    cooldown_until = float(state.get("spectator_cooldown_until", 0.0))
    if now < cooldown_until:
        retry_after = max(0.0, cooldown_until - now)
        return False, f"Spectator cooldown active ({retry_after:.1f}s)", retry_after

    used = int(state.get("spectator_interventions", 0))
    if used >= SPECTATOR_MAX_INTERVENTIONS:
        return False, "Spectator interventions reached match cap", 0.0

    state["spectator_interventions"] = used + 1
    state["spectator_cooldown_until"] = now + SPECTATOR_COOLDOWN_SEC
    return True, "ok", 0.0


def _intervention_rejected_payload(user_id: str, message: str, retry_after: float) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "item_dropped",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "intervention_rejected",
                "message": message,
                "retry_after_sec": round(max(0.0, retry_after), 2),
            },
        },
    }


def _match_pause_payload(user_id: str, reason: str) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "match_paused",
            "user": "server",
            "payload": {
                "kind": "match_pause",
                "missing_user": user_id,
                "reason": reason,
                "message": f"Match paused: waiting for {user_id} reconnection",
                "grace_sec": RECONNECT_GRACE_SEC,
            },
        },
    }


def _match_resumed_payload(user_id: str) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "match_resumed",
            "user": "server",
            "payload": {
                "kind": "match_resumed",
                "user": user_id,
                "message": f"{user_id} reconnected. Match resumed.",
            },
        },
    }


def _schedule_disconnect_resolution(room_id: str, user_id: str, reason: str) -> None:
    key = (room_id, user_id)
    existing = room_disconnect_tasks.get(key)
    if existing and not existing.done():
        return

    async def _runner() -> None:
        try:
            await asyncio.sleep(DISCONNECT_DETECT_SEC)
            if room_user_map.get(room_id, {}).get(user_id):
                return

            state = _ensure_runtime_state(room_id)
            state["paused"] = True
            state["pause_reason"] = reason
            await _broadcast_room(room_id, _match_pause_payload(user_id, reason))

            await asyncio.sleep(RECONNECT_GRACE_SEC)
            if room_user_map.get(room_id, {}).get(user_id):
                state["paused"] = False
                state["pause_reason"] = ""
                await _broadcast_room(room_id, _match_resumed_payload(user_id))
                return

            state_combatants = _ensure_runtime_state(room_id).get("combatants", [])
            users = [str(uid) for uid in state_combatants if isinstance(uid, str)]
            if user_id not in users:
                users.append(user_id)
            if len(users) < 2:
                for uid in room_user_meta.get(room_id, {}).keys():
                    sid = str(uid)
                    if sid not in users:
                        users.append(sid)
                    if len(users) >= 2:
                        break
            forced_results = {uid: ("LOSE" if uid == user_id else "WIN") for uid in users}
            disconnect_payload = {
                "type": "event",
                "data": {
                    "event": "disconnect_tko",
                    "user": "server",
                    "payload": {
                        "kind": "disconnect_tko",
                        "loser": user_id,
                        "reason": reason,
                    },
                },
            }
            await _broadcast_room(room_id, disconnect_payload)
            _record_room_event(room_id, user_id, disconnect_payload["data"])
            _finalize_room_runtime(
                room_id,
                trigger="disconnect_tko",
                forced_results=forced_results,
            )
            room_user_meta.get(room_id, {}).pop(user_id, None)
            await _broadcast_room(
                room_id,
                {
                    "type": "event",
                    "data": {
                        "event": "match_end",
                        "user": "server",
                        "payload": {"kind": "disconnect_tko", "loser": user_id},
                    },
                },
            )
            await _broadcast_roster(room_id)
        finally:
            room_disconnect_tasks.pop(key, None)

    room_disconnect_tasks[key] = asyncio.create_task(_runner())


def _cleanup_game_client(websocket: Any, reason: str = "connection_closed") -> bool:
    meta = game_clients.pop(websocket, None)
    if not meta:
        return False

    room_id = meta["room_id"]
    user_id = meta["user_id"]
    room_members[room_id].discard(websocket)
    current = room_user_map.get(room_id, {}).get(user_id)
    if current is websocket:
        del room_user_map[room_id][user_id]
    if not room_members[room_id]:
        room_members.pop(room_id, None)
        room_user_map.pop(room_id, None)
        room_user_meta.pop(room_id, None)
        for key in [k for k in room_disconnect_tasks.keys() if k[0] == room_id]:
            _cancel_disconnect_task(key[0], key[1])
        _finalize_room_runtime(room_id, trigger="room_empty")
        return True
    _schedule_disconnect_resolution(room_id, user_id, reason=reason)
    return False


def _register_game_client(
    websocket: Any, user_id: str, room_id: str, lang: str, sync_rate: float
) -> None:
    existing = room_user_map.get(room_id, {}).get(user_id)
    if existing and existing is not websocket:
        _cleanup_game_client(existing, reason="replaced_connection")

    game_clients[websocket] = {
        "user_id": user_id,
        "room_id": room_id,
        "lang": lang,
        "sync_rate": sync_rate,
    }
    room_members[room_id].add(websocket)
    room_user_map[room_id][user_id] = websocket
    room_user_meta[room_id][user_id] = {
        "lang": lang,
        "sync_rate": sync_rate,
        "last_heartbeat": time.monotonic(),
    }
    _cancel_disconnect_task(room_id, user_id)
    state = _ensure_runtime_state(room_id)
    combatants = state.get("combatants")
    if not isinstance(combatants, list):
        combatants = []
    if user_id not in combatants and len(combatants) < 2:
        combatants.append(user_id)
    state["combatants"] = combatants
    state["per_user"][user_id]["lang"] = lang
    state["per_user"][user_id]["sync_rate"] = round(sync_rate, 3)
    state["per_user"][user_id]["last_heartbeat"] = time.monotonic()
    has_pending_for_room = any(key[0] == room_id for key in room_disconnect_tasks.keys())
    if state.get("paused") and not has_pending_for_room:
        state["paused"] = False
        state["pause_reason"] = ""
        asyncio.create_task(_broadcast_room(room_id, _match_resumed_payload(user_id)))


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
        _cleanup_game_client(ws, reason="send_failed")


async def _heartbeat_watchdog() -> None:
    while True:
        await asyncio.sleep(1.0)
        now = time.monotonic()
        stale_clients = []
        for room_id, users in room_user_meta.items():
            for user_id, meta in users.items():
                ws = room_user_map.get(room_id, {}).get(user_id)
                if ws is None:
                    continue
                last = float(meta.get("last_heartbeat", 0.0))
                if now - last <= HEARTBEAT_MISS_SEC:
                    continue
                key = (room_id, user_id)
                if key in room_disconnect_tasks:
                    continue
                stale_clients.append(ws)

        for ws in stale_clients:
            try:
                await ws.close()
            except Exception:
                pass
            _cleanup_game_client(ws, reason="heartbeat_timeout")


def _initial_tactics_payload(lang: str) -> dict:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "payload": _localized_tactics(lang),
        },
    }


def _update_persona_tone(
    room_id: str,
    user_id: str,
    verdict: str,
    lang: str,
    audio_result: Optional[dict[str, Any]] = None,
) -> Optional[dict]:
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
    if isinstance(audio_result, dict):
        metrics["last_audio"] = {
            "accuracy": round(float(audio_result.get("accuracy", 0.0)), 3),
            "speed": round(float(audio_result.get("speed", 0.0)), 3),
            "passion": round(float(audio_result.get("passion", 0.0)), 3),
            "score": round(float(audio_result.get("score", 0.0)), 3),
        }

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
    image_bytes = b""
    if isinstance(image_data, str) and image_data:
        try:
            image_bytes = base64.b64decode(image_data)
        except Exception:
            image_bytes = image_data.encode("utf-8")

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




def _normalize_material(value: Any) -> str:
    material = str(value or "Wood").strip().capitalize()
    if material not in {"Wood", "Metal", "Resin"}:
        return "Wood"
    return material


def _calc_max_hp(vit: int) -> int:
    return 100 + max(1, int(vit)) * 2


def _calc_damage(
    attacker_power: int,
    attacker_material: str,
    defender_material: str,
    is_critical: bool,
) -> int:
    base = 10 + (max(1, int(attacker_power)) * 0.3)
    multiplier = MATERIAL_DAMAGE_MULTIPLIER.get(_normalize_material(attacker_material), {}).get(
        _normalize_material(defender_material),
        1.0,
    )
    crit = 2.0 if is_critical else 1.0
    return max(1, int(math.floor(base * multiplier * crit)))


def _calc_down_chance(vit: int) -> float:
    return max(0.0, 0.5 - (max(1, int(vit)) / 200.0))


def _is_heat_activated(self_hp: int, max_hp: int, opponent_hp: int) -> bool:
    if max_hp <= 0:
        return False
    return (self_hp / max_hp) <= 0.2 and (opponent_hp - self_hp) > (max_hp * 0.3)


def _combatant_ids(room_id: str) -> list[str]:
    state = _ensure_runtime_state(room_id)
    current_users = set(room_user_map.get(room_id, {}).keys())
    combatants: list[str] = []

    raw = state.get("combatants", [])
    if isinstance(raw, list):
        for uid in raw:
            sid = str(uid)
            if sid in current_users and sid not in combatants:
                combatants.append(sid)
            if len(combatants) >= 2:
                break

    if len(combatants) < 2:
        for uid in sorted(current_users):
            if uid not in combatants:
                combatants.append(uid)
            if len(combatants) >= 2:
                break

    state["combatants"] = combatants
    return combatants


def _room_user_lang(room_id: str, user_id: str, default: str = "en-US") -> str:
    meta = room_user_meta.get(room_id, {}).get(user_id, {})
    return str(meta.get("lang", default))


def _ensure_user_battle_metrics(
    room_id: str,
    user_id: str,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state = _ensure_runtime_state(room_id)
    metrics = state["per_user"][user_id]

    robot = profile.get("robot", {}) if isinstance(profile, dict) else {}
    if not isinstance(robot, dict):
        robot = {}
    stats = robot.get("stats", {})
    if not isinstance(stats, dict):
        stats = {}

    power = int(stats.get("power", metrics.get("power", 40)))
    vit = int(stats.get("vit", metrics.get("vit", 40)))
    material = _normalize_material(robot.get("material", metrics.get("material", "Wood")))
    max_hp = _calc_max_hp(vit)

    metrics["material"] = material
    metrics["power"] = max(1, power)
    metrics["vit"] = max(1, vit)
    metrics["max_hp"] = max_hp
    if "hp" not in metrics:
        metrics["hp"] = max_hp
    else:
        metrics["hp"] = max(0, min(int(metrics.get("hp", max_hp)), max_hp))

    metrics.setdefault("critical_hits", 0)
    metrics.setdefault("misses", 0)
    metrics.setdefault("ex_gauge", 0.0)
    metrics.setdefault("special_ready", False)
    metrics.setdefault("heat_active", False)
    metrics.setdefault("last_ex_tick", time.monotonic())
    return metrics


def _set_ex_gauge(metrics: dict[str, Any], value: float) -> tuple[bool, bool]:
    before = float(metrics.get("ex_gauge", 0.0))
    ready_before = bool(metrics.get("special_ready", False))
    bounded = max(0.0, min(EX_GAUGE_MAX, float(value)))
    metrics["ex_gauge"] = bounded
    ready_after = bounded >= (EX_GAUGE_MAX - 1e-6)
    metrics["special_ready"] = ready_after
    changed = int(before) != int(bounded) or ready_before != ready_after
    became_ready = (not ready_before) and ready_after
    return changed, became_ready


def _apply_ex_tick(metrics: dict[str, Any], now: float) -> tuple[bool, bool]:
    last = float(metrics.get("last_ex_tick", now))
    elapsed = max(0.0, now - last)
    metrics["last_ex_tick"] = now
    if elapsed <= 0.0:
        return False, False
    current = float(metrics.get("ex_gauge", 0.0))
    return _set_ex_gauge(metrics, current + (elapsed * EX_GAUGE_PER_SECOND))


def _battle_status_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "battle_status",
                "hp": int(metrics.get("hp", 0)),
                "max_hp": int(metrics.get("max_hp", 0)),
                "ex_gauge": int(round(float(metrics.get("ex_gauge", 0.0)))),
                "ex_max": int(EX_GAUGE_MAX),
                "special_ready": bool(metrics.get("special_ready", False)),
                "heat_active": bool(metrics.get("heat_active", False)),
                "material": _normalize_material(metrics.get("material", "Wood")),
            },
        },
    }


def _ex_gauge_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "ex_gauge_update",
                "value": int(round(float(metrics.get("ex_gauge", 0.0)))),
                "max": int(EX_GAUGE_MAX),
                "special_ready": bool(metrics.get("special_ready", False)),
                "hp": int(metrics.get("hp", 0)),
                "max_hp": int(metrics.get("max_hp", 0)),
                "heat_active": bool(metrics.get("heat_active", False)),
            },
        },
    }


def _special_ready_payload(room_id: str, user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    lang = _room_user_lang(room_id, user_id, default="en-US")
    return {
        "type": "event",
        "data": {
            "event": "special_ready",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "special_ready",
                "text": _special_phrase_for_lang(lang),
                "ex_gauge": int(round(float(metrics.get("ex_gauge", 0.0)))),
                "max": int(EX_GAUGE_MAX),
            },
        },
    }


def _heat_state_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "heat_state",
            "user": "server",
            "target": user_id,
            "payload": {
                "kind": "heat_state",
                "active": bool(metrics.get("heat_active", False)),
                "hp": int(metrics.get("hp", 0)),
                "max_hp": int(metrics.get("max_hp", 0)),
            },
        },
    }


def _damage_applied_payload(
    *,
    attacker_id: str,
    defender_id: str,
    damage: int,
    defender_metrics: dict[str, Any],
    is_critical: bool,
) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "damage_applied",
            "user": "server",
            "payload": {
                "kind": "damage_applied",
                "attacker": attacker_id,
                "target": defender_id,
                "damage": int(damage),
                "is_critical": bool(is_critical),
                "hp_after": int(defender_metrics.get("hp", 0)),
                "max_hp": int(defender_metrics.get("max_hp", 0)),
                "material": _normalize_material(defender_metrics.get("material", "Wood")),
            },
        },
    }


def _down_state_payload(defender_id: str, chance: float) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "down_state",
            "user": "server",
            "payload": {
                "kind": "down_state",
                "target": defender_id,
                "down": True,
                "chance": round(chance, 3),
            },
        },
    }


async def _tick_room_ex_gauge(room_id: str) -> None:
    if room_id not in room_runtime_state:
        return
    now = time.monotonic()
    for user_id in _combatant_ids(room_id):
        metrics = _ensure_user_battle_metrics(room_id, user_id)
        changed, became_ready = _apply_ex_tick(metrics, now)
        if changed:
            await _broadcast_room(room_id, _ex_gauge_payload(user_id, metrics), target_user=user_id)
        if became_ready:
            await _broadcast_room(room_id, _special_ready_payload(room_id, user_id, metrics), target_user=user_id)


def _consume_special_gauge(room_id: str, user_id: str) -> tuple[bool, dict[str, Any]]:
    metrics = _ensure_user_battle_metrics(room_id, user_id)
    if not bool(metrics.get("special_ready", False)):
        return False, metrics
    metrics["last_ex_tick"] = time.monotonic()
    _set_ex_gauge(metrics, 0.0)
    return True, metrics


async def _finish_match_by_hp(room_id: str, loser_id: str, reason: str = "hp_zero") -> None:
    if room_id not in room_runtime_state:
        return

    combatants = _combatant_ids(room_id)
    if loser_id not in combatants:
        return
    winner_id = next((uid for uid in combatants if uid != loser_id), None)

    forced_results = {uid: ("LOSE" if uid == loser_id else "WIN") for uid in combatants}
    _finalize_room_runtime(room_id, trigger=reason, forced_results=forced_results)
    await _broadcast_room(
        room_id,
        {
            "type": "event",
            "data": {
                "event": "match_end",
                "user": "server",
                "payload": {"kind": reason, "loser": loser_id, "winner": winner_id},
            },
        },
    )

    if not winner_id:
        return

    loser_lang = _room_user_lang(room_id, loser_id, default="en-US")
    await _broadcast_winner_interview_and_bgm(room_id, winner_id, loser_id, loser_lang)


async def _resolve_special_damage(room_id: str, attacker_id: str, is_critical: bool) -> None:
    if not is_critical:
        return

    combatants = _combatant_ids(room_id)
    if attacker_id not in combatants:
        return
    defender_id = next((uid for uid in combatants if uid != attacker_id), None)
    if not defender_id:
        return

    attacker_metrics = _ensure_user_battle_metrics(room_id, attacker_id)
    defender_metrics = _ensure_user_battle_metrics(room_id, defender_id)

    damage = _calc_damage(
        attacker_power=int(attacker_metrics.get("power", 40)),
        attacker_material=str(attacker_metrics.get("material", "Wood")),
        defender_material=str(defender_metrics.get("material", "Wood")),
        is_critical=is_critical,
    )
    defender_metrics["hp"] = max(0, int(defender_metrics.get("hp", 0)) - damage)

    attacker_delta = EX_GAUGE_ON_CRITICAL if is_critical else EX_GAUGE_ON_HIT
    atk_changed, atk_ready = _set_ex_gauge(
        attacker_metrics,
        float(attacker_metrics.get("ex_gauge", 0.0)) + attacker_delta,
    )
    def_changed, def_ready = _set_ex_gauge(
        defender_metrics,
        float(defender_metrics.get("ex_gauge", 0.0)) + EX_GAUGE_ON_HIT_RECEIVED,
    )

    if atk_changed:
        await _broadcast_room(room_id, _ex_gauge_payload(attacker_id, attacker_metrics), target_user=attacker_id)
    if atk_ready:
        await _broadcast_room(room_id, _special_ready_payload(room_id, attacker_id, attacker_metrics), target_user=attacker_id)
    if def_changed:
        await _broadcast_room(room_id, _ex_gauge_payload(defender_id, defender_metrics), target_user=defender_id)
    if def_ready:
        await _broadcast_room(room_id, _special_ready_payload(room_id, defender_id, defender_metrics), target_user=defender_id)

    damage_payload = _damage_applied_payload(
        attacker_id=attacker_id,
        defender_id=defender_id,
        damage=damage,
        defender_metrics=defender_metrics,
        is_critical=is_critical,
    )
    await _broadcast_room(room_id, damage_payload)
    _record_room_event(room_id, attacker_id, damage_payload["data"])

    attacker_heat_before = bool(attacker_metrics.get("heat_active", False))
    defender_heat_before = bool(defender_metrics.get("heat_active", False))
    attacker_metrics["heat_active"] = _is_heat_activated(
        int(attacker_metrics.get("hp", 0)),
        int(attacker_metrics.get("max_hp", 0)),
        int(defender_metrics.get("hp", 0)),
    )
    defender_metrics["heat_active"] = _is_heat_activated(
        int(defender_metrics.get("hp", 0)),
        int(defender_metrics.get("max_hp", 0)),
        int(attacker_metrics.get("hp", 0)),
    )
    if attacker_heat_before != bool(attacker_metrics.get("heat_active", False)):
        await _broadcast_room(room_id, _heat_state_payload(attacker_id, attacker_metrics), target_user=attacker_id)
    if defender_heat_before != bool(defender_metrics.get("heat_active", False)):
        await _broadcast_room(room_id, _heat_state_payload(defender_id, defender_metrics), target_user=defender_id)

    if is_critical:
        chance = _calc_down_chance(int(defender_metrics.get("vit", 40)))
        if random.random() < chance:
            down_payload = _down_state_payload(defender_id, chance)
            await _broadcast_room(room_id, down_payload)
            _record_room_event(room_id, attacker_id, down_payload["data"])

    if int(defender_metrics.get("hp", 0)) <= 0:
        await _finish_match_by_hp(room_id, defender_id)


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

    speed = _clamp01(packet_rate / 8.0)
    
    # We blend PCM physical amplitude with GenAI semantic passion if supported
    # Fallback uses pure amplitude:
    pcm_passion = _clamp01((avg_amplitude * 1.2) + (peak_amplitude * 0.35))
    
    client = _get_genai_client(INTERACTIONS_API_VERSION)
    if client is None:
        accuracy = _clamp01(0.45 + 0.55 * duration_score)
        passion = pcm_passion
    else:
        model = _normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
        prompt = (
            "You are evaluating a player shouting a special move in an AR game.\n"
            f"The player's vocal amplitude was measured at {pcm_passion:.2f}/1.0.\n"
            "Assess their passion and accuracy out of 1.0. Output valid JSON only, like:\n"
            '{"accuracy": 0.8, "passion": 0.9}'
        )
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            txt = response.text.strip()
            # Try parsing
            if txt.startswith("```json"): txt = txt[7:]
            if txt.endswith("```"): txt = txt[:-3]
            parsed = json.loads(txt.strip())
            accuracy = float(parsed.get("accuracy", 0.7))
            ai_passion = float(parsed.get("passion", 0.7))
            passion = (pcm_passion * 0.4) + (ai_passion * 0.6)
        except Exception as e:
            print(f"[AUDIO] GenAI eval failed: {e}")
            accuracy = _clamp01(0.45 + 0.55 * duration_score)
            passion = pcm_passion

    base_total = (accuracy * 0.45) + (speed * 0.2) + (passion * 0.35)
    sync_bonus = (sync_rate - 0.5) * SYNC_BONUS_FACTOR
    total = _clamp01(base_total + sync_bonus)
    critical_threshold = _clamp01(CRITICAL_THRESHOLD_BASE - (sync_rate * SYNC_THRESHOLD_FACTOR))
    verdict = "critical" if total >= critical_threshold else "miss"

    result = {
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
    # T2-2: structured JSON log for voice judge monitoring
    print(json.dumps({
        "event": "voice_judge",
        "result": verdict,
        "score": round(total, 3),
        "threshold": round(critical_threshold, 3),
        "accuracy": round(accuracy, 3),
        "speed": round(speed, 3),
        "passion": round(passion, 3),
        "sync_rate": round(sync_rate, 3),
        "frame_count": frame_count,
        "elapsed_sec": round(elapsed, 3),
    }))
    return result

def _normalize_persona_tone(raw_prompt: str) -> str:
    prompt = (raw_prompt or "").strip()
    if not prompt:
        return "balanced"
    lowered = prompt.lower()
    if "関西" in prompt or "オカン" in prompt or "kansai" in lowered or "mom" in lowered:
        return "kansai_okan"
    if "やさぐ" in prompt or "不信" in prompt or "distrust" in lowered:
        return "distrustful"
    if "focused" in lowered or "集中" in prompt:
        return "focused"
    if "confident" in lowered or "強気" in prompt:
        return "confident"
    if "balanced" in lowered or "標準" in prompt:
        return "balanced"
    return prompt[:40]


def _trim_proactive_line(text: str, max_chars: int = PROACTIVE_LINE_MAX_CHARS) -> str:
    compact = " ".join((text or "").split()).strip()
    if not compact:
        return "..."
    if len(compact) <= max_chars:
        return compact
    return compact[:max_chars]


def _fallback_proactive_line(lang: str, trigger: str) -> str:
    bucket = _lang_bucket(lang)
    key = (trigger or "").strip().lower()
    if bucket == "ja":
        mapping = {
            "darkness": "夜が来たな",
            "sunset": "夕焼け、熱い",
            "rematch": "また来たか",
            "wood_bench": "いい木材だ",
            "spring_roll": "春巻き、武器だ",
        }
        return mapping.get(key, "空気が変わる")
    if bucket == "es":
        mapping = {
            "darkness": "Llego la noche",
            "sunset": "Atardecer vivo",
            "rematch": "Otra vez tu",
            "wood_bench": "Buena madera",
            "spring_roll": "Arma enrollada",
        }
        return mapping.get(key, "Cambio de aire")
    mapping = {
        "darkness": "Night falls.",
        "sunset": "Red dusk.",
        "rematch": "You again.",
        "wood_bench": "Good lumber.",
        "spring_roll": "Roll to blade.",
    }
    return mapping.get(key, "Air changed.")


def _voice_growth_feedback(profile: dict[str, Any], lang: str) -> str:
    logs = profile.get("training_logs", [])
    if not isinstance(logs, list) or len(logs) < 2:
        return ""

    def _score(log: Any) -> float:
        if not isinstance(log, dict):
            return 0.0
        acc = _to_float(log.get("accuracy_score", log.get("accuracy", 0.0)), 0.0)
        spd = _to_float(log.get("speed_score", log.get("speed", 0.0)), 0.0)
        pas = _to_float(log.get("passion_score", log.get("passion", 0.0)), 0.0)
        return _clamp01((acc * 0.5) + (spd * 0.25) + (pas * 0.25))

    recent = logs[-2:]
    prior = logs[-4:-2] if len(logs) >= 4 else logs[:-2]
    if not prior:
        return ""
    recent_avg = sum(_score(item) for item in recent) / max(1, len(recent))
    prior_avg = sum(_score(item) for item in prior) / max(1, len(prior))
    delta = recent_avg - prior_avg
    if delta < 0.08:
        return ""
    bucket = _lang_bucket(lang)
    if bucket == "ja":
        return "今日は声、震えてなかったな。"
    if bucket == "es":
        return "Hoy tu voz temblo menos."
    return "Your voice was steadier today."


def _recent_highlight_text(profile: dict[str, Any]) -> str:
    logs = profile.get("match_logs", [])
    if not isinstance(logs, list):
        return ""
    descs: list[str] = []
    for match in logs[-3:]:
        if not isinstance(match, dict):
            continue
        events = match.get("highlight_events", [])
        if not isinstance(events, list):
            continue
        for item in events[:3]:
            if not isinstance(item, dict):
                continue
            text = str(item.get("description", "")).strip()
            if text:
                descs.append(text)
    if not descs:
        return ""
    return "; ".join(descs[:4])


async def _generate_proactive_line(
    *,
    user_id: str,
    room_id: str,
    trigger: str,
    context: str,
) -> str:
    lang = _room_user_lang(room_id, user_id, default="en-US")
    sync_rate = _clamp01(_to_float(room_user_meta.get(room_id, {}).get(user_id, {}).get("sync_rate", 0.5), 0.5))
    profile = _load_user_profile(user_id, lang, sync_rate)
    tone = str(profile.get("robot", {}).get("personality", {}).get("tone", "balanced"))
    memory = str(profile.get("ai_memory_summary", ""))[-240:]
    fallback = _fallback_proactive_line(lang, trigger)
    client = _get_genai_client(INTERACTIONS_API_VERSION)
    if client is None:
        return _trim_proactive_line(fallback)
    prompt = (
        "You are an AR battle robot speaking a subtle internal monologue.\n"
        f"Language: {lang}\n"
        f"Tone: {tone}\n"
        f"Vision trigger: {trigger}\n"
        f"Context: {context}\n"
        f"Memory: {memory or '(none)'}\n"
        f"Rules: output exactly one sentence, <= {PROACTIVE_LINE_MAX_CHARS} characters, "
        "no advice, no imperative verbs, no quotes."
    )
    model = _normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents=prompt,
        )
        raw = to_json_safe(response)
        fragments: list[str] = []
        _collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments)).strip()
        return _trim_proactive_line(text or fallback)
    except Exception as exc:
        print(f"[AI] proactive line failed: {exc}")
        return _trim_proactive_line(fallback)


def _vision_action_for_trigger(trigger: str) -> str | None:
    key = (trigger or "").strip().lower()
    if key == "darkness":
        return "glow_eyes"
    if key == "spring_roll":
        return "suggest_scan"
    return None


async def _emit_victory_bgm(
    *,
    room_id: str,
    winner_id: str,
    loser_id: str,
    highlight_summary: str,
) -> None:
    try:
        bgm_url: str | None = None
        if milestone_generator is not None:
            bgm_url = await milestone_generator.trigger_victory_music(
                winner_id,
                highlight_summary,
            )
        await asyncio.sleep(max(0.0, BGM_READY_DELAY_SEC))
        payload = {
            "type": "event",
            "data": {
                "event": "bgm_ready",
                "user": "server",
                "payload": {
                    "kind": "bgm_ready",
                    "winner": winner_id,
                    "loser": loser_id,
                    "url": bgm_url,
                },
            },
        }
        print(json.dumps({
            "event": "bgm_ready",
            "room_id": room_id,
            "winner": winner_id,
            "loser": loser_id,
            "url": bgm_url,
        }))
        await _broadcast_room(room_id, payload)
    except Exception as exc:
        print(f"[AI] Failed to emit victory BGM: {exc}")


async def _generate_winner_interview(room_id: str, winner_id: str, loser_id: str, loser_lang: str) -> str:
    """Doc 12: localized winner interview with growth context."""
    winner_lang = _room_user_lang(room_id, winner_id, default="en-US")
    winner_sync = _clamp01(
        _to_float(room_user_meta.get(room_id, {}).get(winner_id, {}).get("sync_rate", 0.5), 0.5)
    )
    loser_sync = _clamp01(
        _to_float(room_user_meta.get(room_id, {}).get(loser_id, {}).get("sync_rate", 0.5), 0.5)
    )
    winner_profile = _load_user_profile(winner_id, winner_lang, winner_sync)
    loser_profile = _load_user_profile(loser_id, loser_lang, loser_sync)
    winner_name = str(winner_profile.get("robot", {}).get("name", winner_id))
    tone = str(winner_profile.get("robot", {}).get("personality", {}).get("tone", "balanced"))
    highlights = _recent_highlight_text(winner_profile)
    growth_line = _voice_growth_feedback(loser_profile, loser_lang)

    client = _get_genai_client(INTERACTIONS_API_VERSION)
    fallback = f"{winner_name}: Good match, {loser_id}."
    if growth_line:
        fallback = f"{fallback} {growth_line}"
    if client is None:
        return fallback

    prompt = (
        f"You are AR robot '{winner_name}' and just won against '{loser_id}'.\n"
        f"Speak in the loser's language ({loser_lang}).\n"
        f"Persona tone: {tone}\n"
        f"Recent highlights: {highlights or '(none)'}\n"
        f"Growth feedback to weave naturally if relevant: {growth_line or '(none)'}\n"
        "Return only one compact winner interview line (max ~150 chars)."
    )
    model = _normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents=prompt,
        )
        raw = to_json_safe(response)
        fragments: list[str] = []
        _collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments)).strip()
        if not text:
            return fallback
        return text[:180]
    except Exception as e:
        print(f"[AI] Failed to generate winner interview: {e}")
        return fallback


async def _broadcast_winner_interview_and_bgm(
    room_id: str,
    winner_id: str,
    loser_id: str,
    loser_lang: str,
) -> None:
    interview_text = await _generate_winner_interview(room_id, winner_id, loser_id, loser_lang)
    logger.info(json.dumps({
        "event": "winner_interview",
        "room_id": room_id,
        "winner": winner_id,
        "loser": loser_id,
    }))
    interview_payload = {
        "type": "event",
        "data": {
            "event": "winner_interview",
            "user": "server",
            "target": loser_id,
            "payload": {
                "winner": winner_id,
                "loser": loser_id,
                "text": interview_text,
                "lang": loser_lang,
            },
        },
    }
    await _broadcast_room(room_id, interview_payload)
    asyncio.create_task(
        _emit_victory_bgm(
            room_id=room_id,
            winner_id=winner_id,
            loser_id=loser_id,
            highlight_summary=interview_text,
        )
    )


async def handle_game_connection(websocket: Any, request_path: str) -> None:
    user_id, room_id, lang, sync_rate = _parse_game_identity(request_path)
    _register_game_client(websocket, user_id, room_id, lang, sync_rate)
    profile = _load_user_profile(user_id, lang, sync_rate)
    _save_user_profile(profile)
    battle_metrics = _ensure_user_battle_metrics(room_id, user_id, profile)
    
    if vertex_cache_instance is not None:
        async def _init_cache():
            sys_inst = (
                f"You are evaluating game tactics. Player {user_id} speaks {lang}. "
                f"Tone: {profile.get('robot', {}).get('personality', {}).get('tone', 'balanced')}, "
                f"Sync: {profile.get('robot', {}).get('network', {}).get('sync_rate', 0.5)}"
            )
            contents = [
                f"Memory Summary: {profile.get('ai_memory_summary', 'None')}",
                json.dumps(profile.get('match_logs', []), ensure_ascii=False)
            ]
            await vertex_cache_instance.load_historical_context(user_id, sys_inst, contents)
            
        asyncio.create_task(_init_cache())
    logger.info(
        f"[GAME] connected user={user_id} room={room_id} lang={lang} sync_rate={sync_rate:.2f} "
        f"room_clients={len(room_members.get(room_id, set()))}"
    )

    try:
        await websocket.send(json.dumps(_profile_sync_payload(user_id, profile), ensure_ascii=False))
        pending_milestone = int(profile.get("pending_milestone", 0))
        if pending_milestone > 0:
            await websocket.send(
                json.dumps(_milestone_payload(user_id, pending_milestone), ensure_ascii=False)
            )
            profile["pending_milestone"] = 0
            _save_user_profile(profile)

        await websocket.send(json.dumps(_initial_tactics_payload(lang), ensure_ascii=False))
        await websocket.send(json.dumps(_battle_status_payload(user_id, battle_metrics), ensure_ascii=False))
        await websocket.send(json.dumps(_roster_payload(room_id), ensure_ascii=False))
        await _broadcast_roster(room_id)
    except ConnectionClosed:
        _cleanup_game_client(websocket, reason="connection_closed")
        await _broadcast_roster(room_id)
        logger.info(
            f"[GAME] disconnected user={user_id} room={room_id} "
            f"room_clients={len(room_members.get(room_id, set()))}"
        )
        return

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                continue
            payload = safe_json_loads(message)
            if not payload:
                continue

            packet_type = payload.get("type")
            if packet_type not in {"sync", "event", "signal"}:
                continue
            _mark_user_heartbeat(room_id, user_id)
            await _tick_room_ex_gauge(room_id)

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
                    valid, correction = _validate_sync_packet(room_id, user_id, sync_data)
                    if not valid:
                        correction_event = {
                            "type": "event",
                            "data": {
                                "event": "state_correction",
                                "user": "server",
                                "target": user_id,
                                "payload": correction or {"kind": "state_correction"},
                            },
                        }
                        await _broadcast_room(room_id, correction_event)
                        _record_room_event(room_id, user_id, correction_event["data"])
                        continue
                    _record_room_sync(room_id, user_id, sync_data)
                await _broadcast_room(room_id, payload, exclude=websocket)
            elif packet_type == "event":
                event_data = payload.get("data")
                if isinstance(event_data, dict):
                    event_data["user"] = user_id
                    payload["data"] = event_data
                    payload_obj = event_data.get("payload")

                    if event_data.get("event") == "heartbeat":
                        _mark_user_heartbeat(room_id, user_id)
                        continue

                    if (
                        event_data.get("event") == "buff_applied"
                        and isinstance(payload_obj, dict)
                        and payload_obj.get("action") == "casting_special"
                    ):
                        consumed, updated_metrics = _consume_special_gauge(room_id, user_id)
                        if not consumed:
                            rejected = {
                                "type": "event",
                                "data": {
                                    "event": "buff_applied",
                                    "user": "server",
                                    "target": user_id,
                                    "payload": {
                                        "kind": "special_not_ready",
                                        "message": "EX gauge is not full yet.",
                                    },
                                },
                            }
                            await _broadcast_room(room_id, rejected, target_user=user_id)
                            continue
                        await _broadcast_room(
                            room_id,
                            _ex_gauge_payload(user_id, updated_metrics),
                            target_user=user_id,
                        )

                    if (
                        event_data.get("event") == "request_ui_translations"
                        and isinstance(payload_obj, dict)
                    ):
                        target_lang = str(payload_obj.get("lang", lang) or lang).strip()
                        base_keys: dict = payload_obj.get("base_keys", {})
                        if not isinstance(base_keys, dict) or not base_keys:
                            continue
                        translations: dict = {}
                        client = _get_genai_client(INTERACTIONS_API_VERSION)
                        if client is not None:
                            try:
                                keys_json = json.dumps(base_keys, ensure_ascii=False)
                                prompt = (
                                    f"You are a localization expert. Translate all values in this JSON dictionary to '{target_lang}'.\n"
                                    "Rules:\n"
                                    "- Keep the keys exactly as-is.\n"
                                    "- Preserve any emoji, symbols, or special characters (⚡, etc.) in the values.\n"
                                    "- Keep translations concise (UI labels/button text).\n"
                                    "- Output ONLY the resulting JSON object, no markdown fences, no explanation.\n"
                                    f"Input:\n{keys_json}"
                                )
                                model = _normalize_model_name(UI_TRANSLATION_MODEL, UI_TRANSLATION_MODEL)
                                response = await asyncio.to_thread(
                                    client.models.generate_content,
                                    model=model,
                                    contents=prompt,
                                )
                                raw = to_json_safe(response)
                                fragments: list[str] = []
                                _collect_text_fragments(raw, fragments)
                                text = " ".join(dict.fromkeys(fragments)).strip()
                                if text:
                                    try:
                                        parsed = _safe_json_loads(text)
                                        if isinstance(parsed, dict):
                                            translations = parsed
                                    except Exception:
                                        pass
                            except Exception as exc:
                                logger.warning(json.dumps({
                                    "event": "ui_translations_error",
                                    "lang": target_lang,
                                    "error": str(exc),
                                }))
                        # Fallback: echo base_keys if Gemini unavailable or parse failed
                        if not translations:
                            translations = dict(base_keys)
                        wrapped = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": user_id,
                                "payload": {
                                    "kind": "ui_translations",
                                    "lang": target_lang,
                                    "translations": translations,
                                },
                            },
                        }
                        await _broadcast_room(room_id, wrapped, target_user=user_id)
                        logger.info(json.dumps({
                            "event": "ui_translations_generated",
                            "lang": target_lang,
                            "key_count": len(translations),
                        }))
                        continue

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

                    if (
                        event_data.get("event") == "persona_shift_request"
                        and isinstance(payload_obj, dict)
                    ):
                        target_user = str(event_data.get("target", user_id) or user_id)
                        target_lang = _room_user_lang(room_id, target_user, default=lang)
                        target_sync_rate = clamp01(
                            to_float(
                                room_user_meta.get(room_id, {}).get(target_user, {}).get("sync_rate", sync_rate),
                                sync_rate,
                            )
                        )
                        prompt = str(
                            payload_obj.get("prompt", payload_obj.get("tone", payload_obj.get("style", "")))
                        ).strip()
                        requested_tone = _normalize_persona_tone(prompt or "balanced")

                        profile = _load_user_profile(target_user, target_lang, target_sync_rate)
                        robot = profile.get("robot", {})
                        if not isinstance(robot, dict):
                            robot = {}
                        personality = robot.get("personality", {})
                        if not isinstance(personality, dict):
                            personality = {}
                        previous_tone = str(personality.get("tone", "balanced"))
                        personality["tone"] = requested_tone
                        if prompt:
                            personality["persona_prompt"] = prompt[:80]
                        robot["personality"] = personality
                        profile["robot"] = robot
                        profile["ai_memory_summary"] = _append_memory_summary(
                            str(profile.get("ai_memory_summary", "")),
                            f"{datetime.now(timezone.utc).isoformat()} persona_shift: {requested_tone}",
                        )
                        _save_user_profile(profile)
                        _ensure_runtime_state(room_id)["per_user"][target_user]["tone"] = requested_tone

                        tone_payload = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": target_user,
                                "payload": {
                                    "kind": "persona_tone",
                                    "tone": requested_tone,
                                    "message": _tone_message(target_lang, requested_tone),
                                    "prompt": prompt,
                                    "previous_tone": previous_tone,
                                },
                            },
                        }
                        await _broadcast_room(room_id, tone_payload)
                        _record_room_event(room_id, target_user, tone_payload["data"])
                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(target_user, profile),
                            target_user=target_user,
                        )
                        continue

                    if (
                        event_data.get("event") == "incantation_submitted"
                        and isinstance(payload_obj, dict)
                    ):
                        judge_result = await _run_articulation_judge(payload_obj, user_id, room_id)
                        
                        # Apply sync gain to user profile
                        target_user = str(event_data.get("target", user_id) or user_id)
                        target_lang = _room_user_lang(room_id, target_user, default=lang)
                        
                        current_meta = room_user_meta.get(room_id, {}).get(target_user, {})
                        target_sync_rate = to_float(current_meta.get("sync_rate", sync_rate), sync_rate)
                        
                        profile = _load_user_profile(target_user, target_lang, target_sync_rate)
                        
                        if judge_result.get("ok"):
                            gain = judge_result.get("sync_gain", 0.0)
                            new_sync = clamp01(target_sync_rate + gain)
                            profile["sync_rate"] = new_sync
                            
                            # Record training log
                            logs = profile.get("training_logs", [])
                            if not isinstance(logs, list): logs = []
                            logs.append({
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "phrase": judge_result.get("phrase"),
                                "scores": {
                                    "acc": judge_result.get("accuracy"),
                                    "spd": judge_result.get("speed"),
                                    "pas": judge_result.get("passion")
                                },
                                "gain": gain
                            })
                            profile["training_logs"] = logs[-50:]
                            
                            # Simple memory summary entry
                            profile["ai_memory_summary"] = _append_memory_summary(
                                str(profile.get("ai_memory_summary", "")),
                                f"{datetime.now(timezone.utc).isoformat()} training: phrase='{judge_result.get('phrase')}', "
                                f"verdict={judge_result.get('verdict')}, sync_gain={gain:.3f}"
                            )
                            
                            _save_user_profile(profile)
                            
                            # Update room meta for immediate consistency
                            if room_id in room_user_meta and target_user in room_user_meta[room_id]:
                                room_user_meta[room_id][target_user]["sync_rate"] = new_sync
                        
                        wrapped = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": target_user,
                                "payload": judge_result,
                            },
                        }
                        await _broadcast_room(room_id, wrapped, target_user=target_user)
                        _record_room_event(room_id, user_id, wrapped["data"])
                        continue

                    if (
                        event_data.get("event") == "dna_ab_feedback"
                        and isinstance(payload_obj, dict)
                    ):
                        target_user = str(event_data.get("target", user_id) or user_id)
                        target_lang = _room_user_lang(room_id, target_user, default=lang)
                        target_sync_rate = clamp01(
                            to_float(
                                room_user_meta.get(room_id, {}).get(target_user, {}).get("sync_rate", sync_rate),
                                sync_rate,
                            )
                        )
                        profile = _load_user_profile(target_user, target_lang, target_sync_rate)
                        logs = profile.get("dna_ab_tests", [])
                        if not isinstance(logs, list):
                            logs = []

                        choice = str(payload_obj.get("choice", "A")).strip().upper()
                        if choice not in {"A", "B"}:
                            choice = "A"
                        note = str(payload_obj.get("note", "")).strip()[:120]
                        score_a = to_float(payload_obj.get("scoreA", payload_obj.get("score_a", 0.0)), 0.0)
                        score_b = to_float(payload_obj.get("scoreB", payload_obj.get("score_b", 0.0)), 0.0)
                        entry = {
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "choice": choice,
                            "score_a": round(score_a, 3),
                            "score_b": round(score_b, 3),
                            "note": note,
                            "variant_a": payload_obj.get("variantA"),
                            "variant_b": payload_obj.get("variantB"),
                        }
                        logs.append(entry)
                        profile["dna_ab_tests"] = logs[-40:]
                        profile["ai_memory_summary"] = _append_memory_summary(
                            str(profile.get("ai_memory_summary", "")),
                            f"{entry['timestamp']} dna_ab: choose={choice}, scoreA={score_a:.2f}, scoreB={score_b:.2f}",
                        )
                        _save_user_profile(profile)
                        ack = {
                            "type": "event",
                            "data": {
                                "event": "buff_applied",
                                "user": "server",
                                "target": target_user,
                                "payload": {
                                    "kind": "dna_ab_feedback_saved",
                                    "choice": choice,
                                    "total": len(profile["dna_ab_tests"]),
                                },
                            },
                        }
                        await _broadcast_room(room_id, ack, target_user=target_user)
                        _record_room_event(room_id, target_user, ack["data"])
                        continue

                    if (
                        event_data.get("event") == "walk_vision_trigger"
                        and isinstance(payload_obj, dict)
                    ):
                        target_user = str(event_data.get("target", user_id) or user_id)
                        trigger = str(
                            payload_obj.get("trigger", payload_obj.get("kind", payload_obj.get("scene", "environment")))
                        ).strip().lower()
                        if not trigger:
                            trigger = "environment"
                        context = str(payload_obj.get("context", payload_obj.get("summary", ""))).strip()
                        proactive_text = await _generate_proactive_line(
                            user_id=target_user,
                            room_id=room_id,
                            trigger=trigger,
                            context=context,
                        )
                        action = _vision_action_for_trigger(trigger)
                        proactive_payload = {
                            "type": "event",
                            "data": {
                                "event": "proactive_line",
                                "user": "server",
                                "target": target_user,
                                "payload": {
                                    "kind": "proactive_line",
                                    "trigger": trigger,
                                    "text": proactive_text,
                                    "max_chars": PROACTIVE_LINE_MAX_CHARS,
                                    "action": action,
                                },
                            },
                        }
                        await _broadcast_room(room_id, proactive_payload)
                        _record_room_event(room_id, target_user, proactive_payload["data"])

                        target_lang = _room_user_lang(room_id, target_user, default=lang)
                        target_sync_rate = clamp01(
                            to_float(
                                room_user_meta.get(room_id, {}).get(target_user, {}).get("sync_rate", sync_rate),
                                sync_rate,
                            )
                        )
                        profile = _load_user_profile(target_user, target_lang, target_sync_rate)
                        profile["ai_memory_summary"] = _append_memory_summary(
                            str(profile.get("ai_memory_summary", "")),
                            f"{datetime.now(timezone.utc).isoformat()} proactive({trigger}): {proactive_text}",
                        )
                        _save_user_profile(profile)
                        continue

                    # Client-requested profile refresh (Doc 6 UI sync).
                    if (
                        event_data.get("event") == "buff_applied"
                        and isinstance(payload_obj, dict)
                        and payload_obj.get("kind") == "training_complete"
                    ):
                        refreshed_profile = _append_mode_log(
                            user_id=user_id,
                            lang=lang,
                            sync_rate=sync_rate,
                            mode="training",
                            payload=payload_obj,
                        )
                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(user_id, refreshed_profile),
                            target_user=user_id,
                        )
                        continue

                    if (
                        event_data.get("event") == "buff_applied"
                        and isinstance(payload_obj, dict)
                        and payload_obj.get("kind") == "walk_complete"
                    ):
                        refreshed_profile = _append_mode_log(
                            user_id=user_id,
                            lang=lang,
                            sync_rate=sync_rate,
                            mode="walk",
                            payload=payload_obj,
                        )
                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(user_id, refreshed_profile),
                            target_user=user_id,
                        )
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
                        and str(payload_obj.get("action", "")).strip().lower() == "reject_item"
                    ):
                        target_user = str(event_data.get("target", user_id) or user_id)
                        target_lang = _room_user_lang(room_id, target_user, default=lang)
                        target_sync_rate = clamp01(
                            to_float(
                                room_user_meta.get(room_id, {}).get(target_user, {}).get("sync_rate", sync_rate),
                                sync_rate,
                            )
                        )
                        reason = str(payload_obj.get("reason", "not_my_style")).strip() or "not_my_style"

                        profile = _load_user_profile(target_user, target_lang, target_sync_rate)
                        robot = profile.get("robot", {})
                        if not isinstance(robot, dict):
                            robot = {}
                        personality = robot.get("personality", {})
                        if not isinstance(personality, dict):
                            personality = {}
                        old_tone = str(personality.get("tone", "balanced"))
                        reject_count = to_int(
                            personality.get("reject_item_count", payload_obj.get("reject_count", 0)),
                            0,
                        ) + 1
                        personality["reject_item_count"] = reject_count
                        if reject_count >= REJECT_ITEM_DISTRUST_THRESHOLD:
                            personality["tone"] = "distrustful"
                        new_tone = str(personality.get("tone", old_tone))
                        robot["personality"] = personality
                        profile["robot"] = robot
                        profile["ai_memory_summary"] = _append_memory_summary(
                            str(profile.get("ai_memory_summary", "")),
                            (
                                f"{datetime.now(timezone.utc).isoformat()} reject_item: "
                                f"count={reject_count}, reason={reason}"
                            ),
                        )
                        _save_user_profile(profile)
                        _ensure_runtime_state(room_id)["per_user"][target_user]["tone"] = new_tone

                        rejected_payload = {
                            "type": "event",
                            "data": {
                                "event": "item_dropped",
                                "user": "server",
                                "target": target_user,
                                "payload": {
                                    "kind": "reject_item",
                                    "action": "reject_item",
                                    "reason": reason,
                                    "reject_count": reject_count,
                                    "threshold": REJECT_ITEM_DISTRUST_THRESHOLD,
                                    "tone": new_tone,
                                },
                            },
                        }
                        await _broadcast_room(room_id, rejected_payload)
                        _record_room_event(room_id, target_user, rejected_payload["data"])

                        if new_tone != old_tone:
                            tone_payload = {
                                "type": "event",
                                "data": {
                                    "event": "buff_applied",
                                    "user": "server",
                                    "target": target_user,
                                    "payload": {
                                        "kind": "persona_tone",
                                        "tone": new_tone,
                                        "message": _tone_message(target_lang, new_tone),
                                        "reject_count": reject_count,
                                    },
                                },
                            }
                            await _broadcast_room(room_id, tone_payload)
                            _record_room_event(room_id, target_user, tone_payload["data"])

                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(target_user, profile),
                            target_user=target_user,
                        )
                        continue

                    if (
                        event_data.get("event") == "item_dropped"
                        and isinstance(payload_obj, dict)
                        and bool(payload_obj.get("craft_request"))
                    ):
                        allowed, reason, retry_after = _consume_spectator_intervention(room_id)
                        if not allowed:
                            rejected = _intervention_rejected_payload(user_id, reason, retry_after)
                            await _broadcast_room(room_id, rejected, target_user=user_id)
                            _record_room_event(room_id, user_id, rejected["data"])
                            continue

                        texture_url = await _generate_fusion_texture(payload_obj)
                        target_id = str(event_data.get("target", user_id) or user_id)
                        concept = str(payload_obj.get("concept", "legendary item"))
                        target_lang = _room_user_lang(room_id, target_id, default="ja-JP")
                        target_sync_rate = _clamp01(_to_float(room_user_meta.get(room_id, {}).get(target_id, {}).get("sync_rate", 0.5), 0.5))

                        generated = {
                            "event": "item_dropped",
                            "user": "server",
                            "target": target_id,
                            "payload": {
                                "kind": "fused_item",
                                "requested_by": user_id,
                                "concept": concept,
                                "texture_url": texture_url,
                                "action": "equip",
                            },
                        }
                        await _broadcast_room(room_id, generated)
                        
                        # Persist to inventory (Doc §2.3)
                        profile = _load_user_profile(target_id, target_lang, target_sync_rate)
                        inventory = profile.get("inventory", [])
                        if not isinstance(inventory, list): inventory = []
                        inventory.append({
                            "id": f"fused_{int(time.time())}",
                            "name": f"Fused: {concept}",
                            "url": texture_url,
                            "type": "skin",
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        })
                        profile["inventory"] = inventory[-20:] # Keep last 20
                        _save_user_profile(target_id, profile)
                        
                        # Sync profile to frontend
                        await _broadcast_room(
                            room_id,
                            _profile_sync_payload(target_id, profile),
                            target_user=target_id,
                        )

                        _record_room_event(room_id, user_id, generated)
                        continue

                    if (
                        event_data.get("event") == "match_end"
                    ):
                        _record_room_event(room_id, user_id, event_data)
                        room_state = room_runtime_state.get(room_id, {})
                        per_user = room_state.get("per_user", {})
                        raw_combatants = room_state.get("combatants", [])
                        combatants = [
                            str(uid)
                            for uid in raw_combatants
                            if str(uid) in per_user
                        ]
                        if not combatants:
                            combatants = [str(uid) for uid in per_user.keys()][:2]
                        _finalize_room_runtime(room_id, trigger="match_end")
                        await _broadcast_room(room_id, payload)

                        # Generate Winner Interview (Doc 10)
                        winner_id, loser_id, loser_lang = None, None, "en-US"

                        for u_id in combatants:
                            metrics = per_user.get(u_id, {})
                            criticals = int(metrics.get("critical_hits", 0))
                            misses = int(metrics.get("misses", 0))
                            if criticals >= misses:
                                winner_id = u_id
                            else:
                                loser_id = u_id
                                loser_lang = str(metrics.get("lang", "en-US"))
                                
                        if winner_id and loser_id:
                            await _broadcast_winner_interview_and_bgm(
                                room_id,
                                winner_id,
                                loser_id,
                                loser_lang,
                            )
                        continue

                    _record_room_event(room_id, user_id, event_data)
                await _broadcast_room(room_id, payload, exclude=websocket)
            else:
                await _broadcast_room(room_id, payload, exclude=websocket)
    except ConnectionClosed:
        pass
    finally:
        _cleanup_game_client(websocket, reason="connection_closed")
        await _broadcast_roster(room_id)
        logger.info(
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
                payload = safe_json_loads(message) or {}
                cmd = payload.get("cmd")
                if cmd == "open_audio_gate":
                    audio_gate_open = True
                    source = str(payload.get("source", "unknown"))
                    has_video_track = bool(payload.get("has_video_track", False))
                    lang = str(payload.get("lang", lang or "en-US"))
                    user_id = str(payload.get("user_id", user_id))
                    room_id = str(payload.get("room_id", room_id))
                    try:
                        sync_rate = clamp01(float(payload.get("sync_rate", sync_rate)))
                    except (TypeError, ValueError):
                        sync_rate = clamp01(sync_rate)
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
        await _resolve_special_damage(
            room_id=room_id,
            attacker_id=user_id,
            is_critical=bool(result.get("verdict") == "critical"),
        )

    await websocket.send(json.dumps(result, ensure_ascii=False))


async def handle_character_connection(websocket: Any, request_path: str) -> None:
    try:
        # Wait for the first message which should be the JSON payload
        message = await websocket.recv()
        if isinstance(message, bytes):
            message = message.decode("utf-8")
        
        request_data = safe_json_loads(message)
        if not request_data:
            await websocket.send(json.dumps({"error": "Invalid JSON format"}))
            return
            
        face_image_base64 = request_data.get("face_image_base64")
        preset_text = request_data.get("preset_text")
        
        if generate_robot_stats is not None:
            result = await generate_robot_stats(
                face_image_base64=face_image_base64,
                preset_text=preset_text
            )
            await websocket.send(json.dumps(result, ensure_ascii=False))
        else:
            await websocket.send(json.dumps({"error": "Character generator not available", "error_code": "module_not_loaded"}))
            
    except ConnectionClosed:
        pass
    except Exception as e:
        logger.error(json.dumps({"event": "character_generation", "error_code": "server_error", "error": str(e)}), exc_info=True)
        try:
            await websocket.send(json.dumps({"error": str(e), "error_code": "server_error"}))
        except Exception:
            pass
    finally:
        await websocket.close()


async def websocket_router(websocket: Any, path: Optional[str] = None) -> None:
    request_path = path or getattr(websocket, "path", None)
    if not request_path:
        request_obj = getattr(websocket, "request", None)
        request_path = getattr(request_obj, "path", "/")
    if not isinstance(request_path, str) or not request_path:
        request_path = "/"

    if request_path.startswith(CHARACTER_PATH):
        await handle_character_connection(websocket, request_path)
        return

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
    logger.info("Starting PlaresAR Backend AI Core...")
    logger.info(f"WebSocket server listening on ws://{HOST}:{PORT}")
    logger.info(f"Routes: {GAME_PATH}, {AUDIO_PATH}, {LIVE_PATH}")
    watchdog_task = asyncio.create_task(_heartbeat_watchdog())
    try:
        async with websockets.serve(websocket_router, HOST, PORT):
            await asyncio.Future()
    finally:
        watchdog_task.cancel()


if __name__ == "__main__":
    asyncio.run(start_server())
