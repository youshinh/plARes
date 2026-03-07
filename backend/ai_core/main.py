import base64
import asyncio
import json
import math
import os
import random
import re
import time
import logging
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import websockets
from websockets.exceptions import ConnectionClosed

from .audio_judge import AudioJudgeService
from .adk_bridge import RuntimeAdkBridge, set_adk_bridge
from .audio_session_service import AudioSessionService
from .battle_service import BattleService
from .character_session_service import CharacterSessionService
from .dialogue_service import DialogueService
from .genai_client_factory import GenAIClientFactory
from .genai_helpers import collect_text_fragments, normalize_modalities, normalize_model_name, parse_bool
from .genai_request_service import GenAIRequestService
from .game_session_service import GameSessionService
from .game_application import GameApplication, GameApplicationDeps, GameSessionContext
from .platform_bootstrap import init_mcp_tools, init_vertex_cache, load_environment
from .persistence_service import PersistenceService
from .profile_service import (
    ProfileService,
    default_character_dna,
    evolve_character_dna_by_matches,
    normalize_character_dna,
    normalize_material,
)
from .runtime_service import RuntimeService
from .ui_payloads import (
    initial_tactics_payload,
    lang_bucket,
    special_phrase_for_lang,
    tone_message,
)
from .utils import logger, to_json_safe, safe_json_loads, clamp01, to_float, to_int
from .ws_router import (
    parse_audio_identity,
    parse_game_identity,
    route_websocket_connection,
    serve_forever,
)

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
    from .character_generator import build_robot_profile, generate_robot_stats
except Exception:
    try:
        from ai_core.character_generator import build_robot_profile, generate_robot_stats
    except Exception:
        build_robot_profile = None
        generate_robot_stats = None

load_environment(load_dotenv, __file__)

mcp_server_instance, mcp_firestore_tools = init_mcp_tools(FirestoreMCPServer, logger)
vertex_cache_instance = init_vertex_cache(VertexContextCache, logger)

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
genai_client_factory = GenAIClientFactory(
    genai_module=genai,
    genai_types_module=genai_types,
)


def _default_character_dna(material: str = "Wood", tone: str = "balanced") -> dict[str, Any]:
    return default_character_dna(material, tone)


def _normalize_character_dna(raw: Any, *, material: str = "Wood", tone: str = "balanced") -> dict[str, Any]:
    return normalize_character_dna(raw, material=material, tone=tone)


def _evolve_character_dna_by_matches(dna: dict[str, Any], total_matches: int) -> dict[str, Any]:
    return evolve_character_dna_by_matches(dna, total_matches, DNA_EVOLUTION_MATCH_STEP)


persistence_service = PersistenceService(
    firestore_enabled=FIRESTORE_ENABLED,
    firebase_admin_module=firebase_admin,
    firebase_firestore_module=firebase_firestore,
)


def _get_firestore_client() -> Any | None:
    return persistence_service.get_firestore_client()


def _load_profile_from_firestore(user_id: str) -> dict[str, Any] | None:
    return persistence_service.load_profile_from_firestore(user_id)


def _save_profile_to_firestore(profile: dict[str, Any]) -> None:
    persistence_service.save_profile_to_firestore(profile)


def _save_match_log_to_firestore(user_id: str, match_log: dict[str, Any]) -> None:
    persistence_service.save_match_log_to_firestore(user_id, match_log)


def _get_genai_client(api_version: str) -> Any | None:
    return genai_client_factory.get_client(api_version)


audio_judge_service = AudioJudgeService(
    get_genai_client=_get_genai_client,
    normalize_model_name=normalize_model_name,
    interactions_api_version=INTERACTIONS_API_VERSION,
    interactions_model=INTERACTIONS_MODEL,
    critical_threshold_base=CRITICAL_THRESHOLD_BASE,
    sync_bonus_factor=SYNC_BONUS_FACTOR,
    sync_threshold_factor=SYNC_THRESHOLD_FACTOR,
    logger=logger,
)

genai_request_service = GenAIRequestService(
    get_genai_client=_get_genai_client,
    genai_types=genai_client_factory.genai_types,
    normalize_model_name=normalize_model_name,
    normalize_modalities=normalize_modalities,
    parse_bool=parse_bool,
    to_json_safe=to_json_safe,
    collect_text_fragments=collect_text_fragments,
    disabled_reason=lambda: genai_client_factory.disabled_reason,
    ephemeral_api_version=EPHEMERAL_API_VERSION,
    interactions_api_version=INTERACTIONS_API_VERSION,
    ephemeral_model=EPHEMERAL_MODEL,
    interactions_model=INTERACTIONS_MODEL,
    ephemeral_default_uses=EPHEMERAL_DEFAULT_USES,
    ephemeral_expire_minutes=EPHEMERAL_EXPIRE_MINUTES,
    ephemeral_new_session_minutes=EPHEMERAL_NEW_SESSION_MINUTES,
    mcp_firestore_tools=mcp_firestore_tools,
    vertex_cache_instance=vertex_cache_instance,
)


def _issue_ephemeral_token_sync(requested: dict[str, Any], user_id: str, room_id: str) -> dict[str, Any]:
    return genai_request_service.issue_ephemeral_token_sync(requested, user_id, room_id)


def _run_interaction_sync(requested: dict[str, Any], user_id: str, room_id: str) -> dict[str, Any]:
    return genai_request_service.run_interaction_sync(requested, user_id, room_id)


async def _issue_ephemeral_token(
    requested: dict[str, Any], user_id: str, room_id: str
) -> dict[str, Any]:
    return await genai_request_service.issue_ephemeral_token(requested, user_id, room_id)


async def _run_interaction(
    requested: dict[str, Any], user_id: str, room_id: str
) -> dict[str, Any]:
    return await genai_request_service.run_interaction(requested, user_id, room_id)


profile_service = ProfileService(
    user_runtime_dir=USER_RUNTIME_DIR,
    dna_evolution_match_step=DNA_EVOLUTION_MATCH_STEP,
    load_profile_from_firestore=_load_profile_from_firestore,
    save_profile_to_firestore=_save_profile_to_firestore,
    get_firestore_client=_get_firestore_client,
)


def _user_profile_path(user_id: str) -> Path:
    return profile_service.user_profile_path(user_id)


def _default_user_profile(user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
    return profile_service.default_user_profile(user_id, lang, sync_rate)


def _load_user_profile(user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
    return profile_service.load_user_profile(user_id, lang, sync_rate)


def _save_user_profile(profile: dict[str, Any]) -> None:
    profile_service.save_user_profile(profile)


def _persist_generated_profile(user_id: str, result: dict[str, Any]) -> None:
    if build_robot_profile is None:
        return
    current_profile = profile_service.load_user_profile(user_id, "ja-JP", DEFAULT_SYNC_RATE)
    current_robot = current_profile.get("robot", {})
    current_network = current_robot.get("network", {}) if isinstance(current_robot, dict) else {}
    sync_rate = to_float(current_network.get("sync_rate", DEFAULT_SYNC_RATE), DEFAULT_SYNC_RATE)
    generated_robot = build_robot_profile(result, sync_rate=sync_rate)
    if isinstance(current_robot, dict):
        existing_level = current_robot.get("level")
        if isinstance(existing_level, int) and existing_level > 1:
            generated_robot["level"] = existing_level
    current_profile["robot"] = generated_robot
    _save_user_profile(current_profile)


def _append_mode_log(
    *,
    user_id: str,
    lang: str,
    sync_rate: float,
    mode: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return profile_service.append_mode_log(
        user_id=user_id,
        lang=lang,
        sync_rate=sync_rate,
        mode=mode,
        payload=payload,
    )


def _public_profile_view(profile: dict[str, Any]) -> dict[str, Any]:
    return profile_service.public_profile_view(profile)


def _profile_sync_payload(user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    return profile_service.profile_sync_payload(user_id, profile)


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
    model = normalize_model_name(INTERACTIONS_MODEL, INTERACTIONS_MODEL)
    try:
        response = client.models.generate_content(model=model, contents=prompt)
        raw = to_json_safe(response)
        fragments: list[str] = []
        collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments)).strip()
        if not text:
            return fallback
        if len(text) <= MAX_MEMORY_SUMMARY_CHARS:
            return text
        return text[-MAX_MEMORY_SUMMARY_CHARS:]
    except Exception:
        return fallback


runtime_service = RuntimeService(
    game_clients=game_clients,
    room_members=room_members,
    room_user_map=room_user_map,
    room_user_meta=room_user_meta,
    room_runtime_state=room_runtime_state,
    room_disconnect_tasks=room_disconnect_tasks,
    sync_max_speed_mps=SYNC_MAX_SPEED_MPS,
    sync_max_warp_distance=SYNC_MAX_WARP_DISTANCE,
    disconnect_detect_sec=DISCONNECT_DETECT_SEC,
    reconnect_grace_sec=RECONNECT_GRACE_SEC,
    heartbeat_miss_sec=HEARTBEAT_MISS_SEC,
    spectator_max_interventions=SPECTATOR_MAX_INTERVENTIONS,
    spectator_cooldown_sec=SPECTATOR_COOLDOWN_SEC,
    match_log_dir=MATCH_LOG_DIR,
    match_log_ttl_days=MATCH_LOG_TTL_DAYS,
    connection_closed_exception=ConnectionClosed,
    logger=logger,
    interactions_api_version=INTERACTIONS_API_VERSION,
    interactions_model=INTERACTIONS_MODEL,
    user_profile_path=_user_profile_path,
    load_user_profile=_load_user_profile,
    save_user_profile=_save_user_profile,
    save_match_log_to_firestore=_save_match_log_to_firestore,
    summarize_memory_summary=_summarize_memory_summary,
    normalize_material=normalize_material,
    normalize_character_dna=_normalize_character_dna,
    evolve_character_dna_by_matches=_evolve_character_dna_by_matches,
    get_genai_client=_get_genai_client,
    normalize_model_name=normalize_model_name,
    to_json_safe=to_json_safe,
    collect_text_fragments=collect_text_fragments,
    milestone_generator=milestone_generator,
)


def _ensure_runtime_state(room_id: str) -> dict[str, Any]:
    return runtime_service.ensure_runtime_state(room_id)


def _seed_runtime_state_from_room_meta(room_id: str) -> None:
    runtime_service.seed_runtime_state_from_room_meta(room_id)


def _mark_user_heartbeat(room_id: str, user_id: str) -> None:
    runtime_service.mark_user_heartbeat(room_id, user_id)


def _validate_sync_packet(
    room_id: str,
    user_id: str,
    sync_data: dict[str, Any],
) -> tuple[bool, dict[str, Any] | None]:
    return runtime_service.validate_sync_packet(room_id, user_id, sync_data)


def _record_room_sync(room_id: str, user_id: str, sync_data: dict[str, Any]) -> None:
    runtime_service.record_room_sync(room_id, user_id, sync_data)


def _record_room_event(room_id: str, user_id: str, event_data: dict[str, Any]) -> None:
    runtime_service.record_room_event(room_id, user_id, event_data)


def _finalize_room_runtime(
    room_id: str,
    trigger: str = "room_empty",
    forced_results: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    return runtime_service.finalize_room_runtime(
        room_id,
        trigger=trigger,
        forced_results=forced_results,
    )


def _cancel_disconnect_task(room_id: str, user_id: str) -> None:
    runtime_service.cancel_disconnect_task(room_id, user_id)


def _consume_spectator_intervention(room_id: str) -> tuple[bool, str, float]:
    return runtime_service.consume_spectator_intervention(room_id)


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
    return runtime_service.match_pause_payload(user_id, reason)


def _match_resumed_payload(user_id: str) -> dict[str, Any]:
    return runtime_service.match_resumed_payload(user_id)


def _schedule_disconnect_resolution(room_id: str, user_id: str, reason: str) -> None:
    runtime_service.schedule_disconnect_resolution(room_id, user_id, reason)


def _cleanup_game_client(websocket: Any, reason: str = "connection_closed") -> bool:
    return runtime_service.cleanup_game_client(websocket, reason)


def _register_game_client(
    websocket: Any, user_id: str, room_id: str, lang: str, sync_rate: float
) -> None:
    runtime_service.register_game_client(websocket, user_id, room_id, lang, sync_rate)


def _room_peer_ids(room_id: str) -> list[str]:
    return runtime_service.room_peer_ids(room_id)


def _roster_payload(room_id: str) -> dict:
    return runtime_service.roster_payload(room_id)


async def _broadcast_roster(room_id: str) -> None:
    await runtime_service.broadcast_roster(room_id)


async def _broadcast_room(
    room_id: str,
    payload: dict,
    exclude: Any | None = None,
    target_user: str | None = None,
) -> None:
    await runtime_service.broadcast_room(
        room_id,
        payload,
        exclude=exclude,
        target_user=target_user,
    )


async def _heartbeat_watchdog() -> None:
    await runtime_service.heartbeat_watchdog()


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
                "message": tone_message(lang, new_tone),
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
    return audio_judge_service.score_pcm16_frame(chunk)




def _normalize_material(value: Any) -> str:
    return normalize_material(value)


def _calc_max_hp(vit: int) -> int:
    return battle_service.calc_max_hp(vit)


def _calc_damage(
    attacker_power: int,
    attacker_material: str,
    defender_material: str,
    is_critical: bool,
) -> int:
    return battle_service.calc_damage(
        attacker_power=attacker_power,
        attacker_material=attacker_material,
        defender_material=defender_material,
        is_critical=is_critical,
    )


def _calc_down_chance(vit: int) -> float:
    return battle_service.calc_down_chance(vit)


def _is_heat_activated(self_hp: int, max_hp: int, opponent_hp: int) -> bool:
    return battle_service.is_heat_activated(self_hp, max_hp, opponent_hp)


def _combatant_ids(room_id: str) -> list[str]:
    return battle_service.combatant_ids(room_id)


def _room_user_lang(room_id: str, user_id: str, default: str = "en-US") -> str:
    meta = room_user_meta.get(room_id, {}).get(user_id, {})
    return str(meta.get("lang", default))


def _ensure_user_battle_metrics(
    room_id: str,
    user_id: str,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return battle_service.ensure_user_battle_metrics(room_id, user_id, profile)


def _set_ex_gauge(metrics: dict[str, Any], value: float) -> tuple[bool, bool]:
    return battle_service.set_ex_gauge(metrics, value)


def _apply_ex_tick(metrics: dict[str, Any], now: float) -> tuple[bool, bool]:
    return battle_service.apply_ex_tick(metrics, now)


def _battle_status_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return battle_service.battle_status_payload(user_id, metrics)


def _ex_gauge_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return battle_service.ex_gauge_payload(user_id, metrics)


def _special_ready_payload(room_id: str, user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return battle_service.special_ready_payload(room_id, user_id, metrics)


def _heat_state_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
    return battle_service.heat_state_payload(user_id, metrics)


def _damage_applied_payload(
    *,
    attacker_id: str,
    defender_id: str,
    damage: int,
    defender_metrics: dict[str, Any],
    is_critical: bool,
) -> dict[str, Any]:
    return battle_service.damage_applied_payload(
        attacker_id=attacker_id,
        defender_id=defender_id,
        damage=damage,
        defender_metrics=defender_metrics,
        is_critical=is_critical,
    )


def _down_state_payload(defender_id: str, chance: float) -> dict[str, Any]:
    return battle_service.down_state_payload(defender_id, chance)


async def _tick_room_ex_gauge(room_id: str) -> None:
    await battle_service.tick_room_ex_gauge(room_id)


def _consume_special_gauge(room_id: str, user_id: str) -> tuple[bool, dict[str, Any]]:
    return battle_service.consume_special_gauge(room_id, user_id)


async def _finish_match_by_hp(room_id: str, loser_id: str, reason: str = "hp_zero") -> None:
    await battle_service.finish_match_by_hp(room_id, loser_id, reason)


async def _resolve_special_damage(room_id: str, attacker_id: str, is_critical: bool) -> None:
    await battle_service.resolve_special_damage(room_id, attacker_id, is_critical)


def _build_audio_result(
    frame_count: int,
    packet_count: int,
    elapsed_sec: float,
    avg_amplitude: float,
    peak_amplitude: float,
    sync_rate: float,
) -> dict:
    return audio_judge_service.build_audio_result(
        frame_count=frame_count,
        packet_count=packet_count,
        elapsed_sec=elapsed_sec,
        avg_amplitude=avg_amplitude,
        peak_amplitude=peak_amplitude,
        sync_rate=sync_rate,
    )


async def _run_articulation_judge(
    requested: dict[str, Any],
    user_id: str,
    room_id: str,
) -> dict[str, Any]:
    phrase = str(requested.get("phrase", "")).strip()
    recognized_phrase = str(
        requested.get("recognized_phrase", requested.get("recognizedPhrase", ""))
    ).strip()
    expected_phrase = str(
        requested.get("expected_phrase", requested.get("expectedPhrase", phrase))
    ).strip()
    duration_ms = to_float(requested.get("duration_ms", requested.get("durationMs")), 0.0)
    spirit = to_float(requested.get("spirit", requested.get("passion", 0.7)), 0.7)
    result = audio_judge_service.judge_incantation(
        phrase=phrase,
        recognized_phrase=recognized_phrase or None,
        expected_phrase=expected_phrase or None,
        duration_ms=duration_ms if duration_ms > 0 else None,
        spirit=spirit,
    )
    result["user_id"] = user_id
    result["room_id"] = room_id
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


def _make_dialogue_service() -> DialogueService:
    return DialogueService(
        room_user_meta=room_user_meta,
        room_user_lang=_room_user_lang,
        load_user_profile=_load_user_profile,
        get_genai_client=_get_genai_client,
        interactions_api_version=INTERACTIONS_API_VERSION,
        interactions_model=INTERACTIONS_MODEL,
        normalize_model_name=normalize_model_name,
        to_json_safe=to_json_safe,
        collect_text_fragments=collect_text_fragments,
        proactive_line_max_chars=PROACTIVE_LINE_MAX_CHARS,
        logger=logger,
        milestone_generator=milestone_generator,
        bgm_ready_delay_sec=BGM_READY_DELAY_SEC,
        broadcast_room=_broadcast_room,
        lang_bucket=lang_bucket,
    )


dialogue_service = _make_dialogue_service()


def _voice_growth_feedback(profile: dict[str, Any], lang: str) -> str:
    return _make_dialogue_service()._voice_growth_feedback(profile, lang)


async def _generate_winner_interview(room_id: str, winner_id: str, loser_id: str, loser_lang: str) -> str:
    return await _make_dialogue_service()._generate_winner_interview(room_id, winner_id, loser_id, loser_lang)


async def _generate_proactive_line(
    *,
    user_id: str,
    room_id: str,
    trigger: str,
    context: str,
) -> str:
    return await _make_dialogue_service().generate_proactive_line(
        user_id=user_id,
        room_id=room_id,
        trigger=trigger,
        context=context,
    )


def _vision_action_for_trigger(trigger: str) -> str | None:
    key = (trigger or "").strip().lower()
    if key == "darkness":
        return "glow_eyes"
    if key == "spring_roll":
        return "suggest_scan"
    return None


def _get_adk_status() -> dict[str, Any]:
    if adk_live_handler is None:
        return {
            "kind": "adk_status",
            "available": False,
            "detail": ADK_IMPORT_ERROR or "ADK live handler unavailable",
        }
    return {
        "kind": "adk_status",
        "available": True,
        "detail": "",
    }


async def _broadcast_winner_interview_and_bgm(
    room_id: str,
    winner_id: str,
    loser_id: str,
    loser_lang: str,
) -> None:
    await _make_dialogue_service().broadcast_winner_interview_and_bgm(
        room_id,
        winner_id,
        loser_id,
        loser_lang,
    )


battle_service = BattleService(
    material_damage_multiplier=MATERIAL_DAMAGE_MULTIPLIER,
    ex_gauge_max=EX_GAUGE_MAX,
    ex_gauge_on_hit=EX_GAUGE_ON_HIT,
    ex_gauge_on_critical=EX_GAUGE_ON_CRITICAL,
    ex_gauge_on_hit_received=EX_GAUGE_ON_HIT_RECEIVED,
    ex_gauge_per_second=EX_GAUGE_PER_SECOND,
    room_runtime_state=room_runtime_state,
    room_user_map=room_user_map,
    ensure_runtime_state=_ensure_runtime_state,
    room_user_lang=_room_user_lang,
    special_phrase_for_lang=special_phrase_for_lang,
    broadcast_room=_broadcast_room,
    record_room_event=_record_room_event,
    finalize_room_runtime=_finalize_room_runtime,
    broadcast_winner_interview_and_bgm=_broadcast_winner_interview_and_bgm,
)

runtime_adk_bridge = RuntimeAdkBridge(
    ensure_runtime_state=_ensure_runtime_state,
    room_user_map=room_user_map,
    room_user_meta=room_user_meta,
    clamp01=clamp01,
)

set_adk_bridge(
    runtime_adk_bridge
)


game_application = GameApplication(
    GameApplicationDeps(
        mark_user_heartbeat=_mark_user_heartbeat,
        tick_room_ex_gauge=_tick_room_ex_gauge,
        broadcast_room=_broadcast_room,
        validate_sync_packet=_validate_sync_packet,
        record_room_event=_record_room_event,
        record_room_sync=_record_room_sync,
        consume_special_gauge=_consume_special_gauge,
        ex_gauge_payload=_ex_gauge_payload,
        get_genai_client=_get_genai_client,
        interactions_api_version=INTERACTIONS_API_VERSION,
        normalize_model_name=normalize_model_name,
        ui_translation_model=UI_TRANSLATION_MODEL,
        to_json_safe=to_json_safe,
        collect_text_fragments=collect_text_fragments,
        safe_json_loads=safe_json_loads,
        logger=logger,
        issue_ephemeral_token=_issue_ephemeral_token,
        run_interaction=_run_interaction,
        get_adk_status=_get_adk_status,
        query_battle_state=lambda room_id, user_id: runtime_adk_bridge.query_battle_state(
            room_id=room_id,
            user_id=user_id,
        ),
        propose_tactic=lambda room_id, user_id, action, target=None: runtime_adk_bridge.propose_tactic(
            room_id=room_id,
            user_id=user_id,
            action=action,
            target=target,
        ),
        room_user_lang=_room_user_lang,
        room_user_meta=room_user_meta,
        clamp01=clamp01,
        to_float=to_float,
        normalize_persona_tone=_normalize_persona_tone,
        load_user_profile=_load_user_profile,
        append_memory_summary=_append_memory_summary,
        save_user_profile=_save_user_profile,
        ensure_runtime_state=_ensure_runtime_state,
        tone_message=tone_message,
        profile_sync_payload=_profile_sync_payload,
        run_articulation_judge=_run_articulation_judge,
        generate_proactive_line=_generate_proactive_line,
        vision_action_for_trigger=_vision_action_for_trigger,
        proactive_line_max_chars=PROACTIVE_LINE_MAX_CHARS,
        append_mode_log=_append_mode_log,
        consume_spectator_intervention=_consume_spectator_intervention,
        intervention_rejected_payload=_intervention_rejected_payload,
        generate_fusion_texture=_generate_fusion_texture,
        reject_item_distrust_threshold=REJECT_ITEM_DISTRUST_THRESHOLD,
        to_int=to_int,
        room_runtime_state=room_runtime_state,
        finalize_room_runtime=_finalize_room_runtime,
        broadcast_winner_interview_and_bgm=_broadcast_winner_interview_and_bgm,
    )
)

audio_session_service = AudioSessionService(
    parse_identity=lambda request_path: parse_audio_identity(request_path, clamp01),
    safe_json_loads=safe_json_loads,
    clamp01=clamp01,
    score_pcm16_frame=_score_pcm16_frame,
    build_audio_result=_build_audio_result,
    room_members=room_members,
    room_user_meta=room_user_meta,
    broadcast_room=_broadcast_room,
    record_room_event=_record_room_event,
    update_persona_tone=_update_persona_tone,
    resolve_special_damage=_resolve_special_damage,
    connection_closed_exception=ConnectionClosed,
)

game_session_service = GameSessionService(
    parse_identity=lambda request_path: parse_game_identity(request_path, clamp01),
    register_game_client=_register_game_client,
    load_user_profile=_load_user_profile,
    save_user_profile=_save_user_profile,
    ensure_user_battle_metrics=_ensure_user_battle_metrics,
    vertex_cache_instance=vertex_cache_instance,
    room_members=room_members,
    logger=logger,
    profile_sync_payload=_profile_sync_payload,
    milestone_payload=_milestone_payload,
    initial_tactics_payload=initial_tactics_payload,
    battle_status_payload=_battle_status_payload,
    roster_payload=_roster_payload,
    broadcast_roster=_broadcast_roster,
    cleanup_game_client=lambda websocket: _cleanup_game_client(websocket, reason="connection_closed"),
    safe_json_loads=safe_json_loads,
    game_application=game_application,
    session_context_factory=GameSessionContext,
    connection_closed_exception=ConnectionClosed,
)

character_session_service = CharacterSessionService(
    safe_json_loads=safe_json_loads,
    generate_robot_stats=generate_robot_stats,
    persist_generated_profile=_persist_generated_profile,
    logger=logger,
    connection_closed_exception=ConnectionClosed,
)


async def handle_game_connection(websocket: Any, request_path: str) -> None:
    await game_session_service.handle_connection(websocket, request_path)


async def handle_audio_connection(websocket: Any, request_path: str) -> None:
    await audio_session_service.handle_connection(websocket, request_path)


async def handle_character_connection(websocket: Any, request_path: str) -> None:
    await character_session_service.handle_connection(websocket, request_path)


async def websocket_router(websocket: Any, path: Optional[str] = None) -> None:
    await route_websocket_connection(
        websocket,
        path=path,
        character_path=CHARACTER_PATH,
        game_path=GAME_PATH,
        audio_path=AUDIO_PATH,
        live_path=LIVE_PATH,
        character_handler=handle_character_connection,
        game_handler=handle_game_connection,
        audio_handler=handle_audio_connection,
        live_handler=adk_live_handler,
        live_import_error=ADK_IMPORT_ERROR,
    )


async def start_server() -> None:
    await serve_forever(
        host=HOST,
        port=PORT,
        websocket_router=websocket_router,
        heartbeat_watchdog=_heartbeat_watchdog,
        websockets_module=websockets,
        logger=logger,
        route_summary=f"{GAME_PATH}, {AUDIO_PATH}, {LIVE_PATH}",
    )


if __name__ == "__main__":
    asyncio.run(start_server())
