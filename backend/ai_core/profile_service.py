import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .utils import clamp01, to_float, to_int


def normalize_material(value: Any) -> str:
    material = str(value or "Wood").strip().capitalize()
    if material not in {"Wood", "Metal", "Resin"}:
        return "Wood"
    return material


def default_character_dna(material: str = "Wood", tone: str = "balanced") -> dict[str, Any]:
    palette_by_material = {
        "Wood": "ember",
        "Metal": "marine",
        "Resin": "forest",
    }
    tone_l = str(tone).lower()
    palette = palette_by_material.get(normalize_material(material), "marine")
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
        "bodyType": "slim",
        "finish": "satin",
        "paletteFamily": palette,
        "eyeGlow": eye_glow_by_palette.get(palette, "#73E4FF"),
        "scarLevel": 0,
        "glowIntensity": 1.0,
        "evolutionStage": 0,
        "battlePatina": "clean",
        "materialType": "plastic",
        "emblemUrl": "",
    }


def normalize_character_dna(
    raw: Any,
    *,
    material: str = "Wood",
    tone: str = "balanced",
) -> dict[str, Any]:
    base = default_character_dna(material, tone)
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

    body_type = str(
        raw.get(
            "bodyType",
            "heavy" if silhouette == "tank" or str(raw.get("materialType", "")).lower() == "metal" else base["bodyType"],
        )
    )
    if body_type not in {"heavy", "slim"}:
        body_type = base["bodyType"]
    dna["bodyType"] = body_type

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
    dna["materialType"] = str(raw.get("materialType", base.get("materialType", "plastic")))[:32]
    dna["emblemUrl"] = str(raw.get("emblemUrl", base.get("emblemUrl", "")))
    skin_url = raw.get("skinUrl")
    if isinstance(skin_url, str) and skin_url:
        dna["skinUrl"] = skin_url
    return dna


def evolve_character_dna_by_matches(
    dna: dict[str, Any],
    total_matches: int,
    dna_evolution_match_step: int,
) -> dict[str, Any]:
    stage_step = max(1, dna_evolution_match_step)
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


class ProfileService:
    def __init__(
        self,
        *,
        user_runtime_dir: Path,
        dna_evolution_match_step: int,
        load_profile_from_firestore: Callable[[str], dict[str, Any] | None],
        save_profile_to_firestore: Callable[[dict[str, Any]], None],
        get_firestore_client: Callable[[], Any | None],
    ) -> None:
        self._user_runtime_dir = user_runtime_dir
        self._dna_evolution_match_step = dna_evolution_match_step
        self._load_profile_from_firestore = load_profile_from_firestore
        self._save_profile_to_firestore = save_profile_to_firestore
        self._get_firestore_client = get_firestore_client

    @staticmethod
    def _sanitize_id(val: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "_", str(val))

    def user_profile_path(self, user_id: str) -> Path:
        return self._user_runtime_dir / self._sanitize_id(user_id) / "profile.json"

    def default_user_profile(self, user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
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
                "character_dna": default_character_dna("Wood", "balanced"),
            },
            "match_logs": [],
            "training_logs": [],
            "walk_logs": [],
            "dna_ab_tests": [],
        }

    def load_user_profile(self, user_id: str, lang: str, sync_rate: float) -> dict[str, Any]:
        path = self.user_profile_path(user_id)
        default_profile = self.default_user_profile(user_id, lang, sync_rate)
        loaded: dict[str, Any] | None = self._load_profile_from_firestore(user_id)

        if loaded is None and path.exists():
            try:
                local_loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(local_loaded, dict):
                    loaded = local_loaded
            except Exception:
                loaded = None

        if loaded is None:
            return default_profile

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
        robot["character_dna"] = evolve_character_dna_by_matches(
            normalize_character_dna(
                robot.get("character_dna"),
                material=material,
                tone=str(personality.get("tone", "balanced")),
            ),
            int(profile.get("total_matches", 0)),
            self._dna_evolution_match_step,
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

    def save_user_profile(self, profile: dict[str, Any]) -> None:
        user_id = str(profile.get("user_id", "unknown"))
        path = self.user_profile_path(user_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
        self._save_profile_to_firestore(profile)

    @staticmethod
    def _append_memory_summary(existing: str, entry: str) -> str:
        current = (existing or "").strip()
        next_text = entry.strip()
        if not next_text:
            return current
        joined = f"{current}\n{next_text}" if current else next_text
        return joined[-1200:]

    @staticmethod
    def _to_string_list(value: Any, max_items: int = 20) -> list[str]:
        if not isinstance(value, list):
            return []
        items: list[str] = []
        for item in value:
            text = str(item).strip()
            if text:
                items.append(text)
            if len(items) >= max_items:
                break
        return items

    @classmethod
    def _normalize_highlight_events(cls, raw: Any) -> list[dict[str, str]]:
        if not isinstance(raw, list):
            return []
        events: list[dict[str, str]] = []
        for item in raw[:12]:
            if not isinstance(item, dict):
                continue
            kind = str(item.get("kind", "")).strip()
            description = str(item.get("description", item.get("text", ""))).strip()
            if not kind and not description:
                continue
            events.append({"kind": kind[:32], "description": description[:160]})
        return events

    @staticmethod
    def _safe_timestamp(value: Any, fallback: str) -> str:
        text = str(value).strip()
        if not text:
            return fallback
        try:
            datetime.fromisoformat(text.replace("Z", "+00:00"))
            return text
        except Exception:
            return fallback

    def append_mode_log(
        self,
        *,
        user_id: str,
        lang: str,
        sync_rate: float,
        mode: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        profile = self.load_user_profile(user_id, lang, sync_rate)
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
            started_at = self._safe_timestamp(payload.get("startedAt", payload.get("started_at", now)), now)
            ended_at = self._safe_timestamp(payload.get("endedAt", payload.get("ended_at", now)), now)
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
            highlights = self._to_string_list(payload.get("highlights", []), max_items=8)
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
                "highlight_events": self._normalize_highlight_events(
                    payload.get("highlight_events", payload.get("highlightEvents", []))
                ),
            }
            logs = profile.get("training_logs", [])
            if not isinstance(logs, list):
                logs = []
            logs.append(entry)
            profile["training_logs"] = logs[-50:]
            profile["ai_memory_summary"] = self._append_memory_summary(
                str(profile.get("ai_memory_summary", "")),
                (
                    f"{now} training#{session_id}: sync {sync_before:.2f}->{sync_after:.2f}, "
                    f"acc={entry['accuracy_score']:.2f}, spd={entry['speed_score']:.2f}, pas={entry['passion_score']:.2f}"
                ),
            )
        elif mode == "walk":
            session_id = str(payload.get("sessionId") or payload.get("session_id") or f"walk_{uuid.uuid4().hex[:10]}")
            started_at = self._safe_timestamp(payload.get("startedAt", payload.get("started_at", now)), now)
            ended_at = self._safe_timestamp(payload.get("endedAt", payload.get("ended_at", now)), now)
            found_items = self._to_string_list(payload.get("foundItems", payload.get("found_items", [])))
            proactive = self._to_string_list(
                payload.get(
                    "proactiveAudioHighlights",
                    payload.get("proactive_audio_highlights", payload.get("proactiveLines", [])),
                )
            )
            vision_triggers = self._to_string_list(
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
                "highlight_events": self._normalize_highlight_events(
                    payload.get("highlight_events", payload.get("highlightEvents", []))
                ),
            }
            logs = profile.get("walk_logs", [])
            if not isinstance(logs, list):
                logs = []
            logs.append(entry)
            profile["walk_logs"] = logs[-50:]
            profile["ai_memory_summary"] = self._append_memory_summary(
                str(profile.get("ai_memory_summary", "")),
                (
                    f"{now} walk#{session_id}: sync {sync_before:.2f}->{sync_after:.2f}, "
                    f"items={len(entry['found_items'])}, reflections={len(entry['proactive_audio_highlights'])}"
                ),
            )

        self.save_user_profile(profile)
        return profile

    def public_profile_view(self, profile: dict[str, Any]) -> dict[str, Any]:
        robot = profile.get("robot", {})
        personality = robot.get("personality", {})
        network = robot.get("network", {})
        recent_logs_raw = profile.get("match_logs", [])
        training_logs_raw = profile.get("training_logs", [])
        walk_logs_raw = profile.get("walk_logs", [])
        dna_ab_tests_raw = profile.get("dna_ab_tests", [])
        recent_logs = recent_logs_raw[-5:] if isinstance(recent_logs_raw, list) else []
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
            "storage_backend": "firestore" if self._get_firestore_client() is not None else "local",
            "character_dna": normalize_character_dna(
                robot.get("character_dna"),
                material=str(robot.get("material", "Wood")),
                tone=str(personality.get("tone", "balanced")),
            ),
            "robot_stats": robot.get("stats", {}),
            "robot_material": str(robot.get("material", "Wood")),
            "recent_dna_ab_tests": recent_ab_tests,
        }

    def profile_sync_payload(self, user_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": user_id,
                "payload": {"kind": "profile_sync", "profile": self.public_profile_view(profile)},
            },
        }
