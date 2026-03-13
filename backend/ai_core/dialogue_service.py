import asyncio
import json
from typing import Any, Callable

from .utils import clamp01, to_float


class DialogueService:
    def __init__(
        self,
        *,
        room_user_meta: dict[str, dict[str, dict[str, Any]]],
        room_user_lang: Callable[[str, str, str], str],
        load_user_profile: Callable[[str, str, float], dict[str, Any]],
        get_genai_client: Callable[[str], Any | None],
        interactions_api_version: str,
        interactions_model: str,
        normalize_model_name: Callable[[str, str], str],
        to_json_safe: Callable[[Any], Any],
        collect_text_fragments: Callable[[Any, list[str]], None],
        proactive_line_max_chars: int,
        logger: Any,
        milestone_generator: Any | None,
        bgm_ready_delay_sec: float,
        broadcast_room: Callable[..., Any],
        lang_bucket: Callable[[str], str],
    ) -> None:
        self._room_user_meta = room_user_meta
        self._room_user_lang = room_user_lang
        self._load_user_profile = load_user_profile
        self._get_genai_client = get_genai_client
        self._interactions_api_version = interactions_api_version
        self._interactions_model = interactions_model
        self._normalize_model_name = normalize_model_name
        self._to_json_safe = to_json_safe
        self._collect_text_fragments = collect_text_fragments
        self._proactive_line_max_chars = proactive_line_max_chars
        self._logger = logger
        self._milestone_generator = milestone_generator
        self._bgm_ready_delay_sec = bgm_ready_delay_sec
        self._broadcast_room = broadcast_room
        self._lang_bucket = lang_bucket

    def _trim_proactive_line(self, text: str) -> str:
        compact = " ".join((text or "").split()).strip()
        if not compact:
            return "..."
        if len(compact) <= self._proactive_line_max_chars:
            return compact
        return compact[: self._proactive_line_max_chars]

    def _fallback_proactive_line(self, lang: str, trigger: str) -> str:
        bucket = self._lang_bucket(lang)
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

    def _voice_growth_feedback(self, profile: dict[str, Any], lang: str) -> str:
        logs = profile.get("training_logs", [])
        if not isinstance(logs, list) or len(logs) < 2:
            return ""

        def _score(log: Any) -> float:
            if not isinstance(log, dict):
                return 0.0
            acc = to_float(log.get("accuracy_score", log.get("accuracy", 0.0)), 0.0)
            spd = to_float(log.get("speed_score", log.get("speed", 0.0)), 0.0)
            pas = to_float(log.get("passion_score", log.get("passion", 0.0)), 0.0)
            return clamp01((acc * 0.5) + (spd * 0.25) + (pas * 0.25))

        recent = logs[-2:]
        prior = logs[-4:-2] if len(logs) >= 4 else logs[:-2]
        if not prior:
            return ""
        recent_avg = sum(_score(item) for item in recent) / max(1, len(recent))
        prior_avg = sum(_score(item) for item in prior) / max(1, len(prior))
        if (recent_avg - prior_avg) < 0.08:
            return ""
        bucket = self._lang_bucket(lang)
        if bucket == "ja":
            return "今日は声、震えてなかったな。"
        if bucket == "es":
            return "Hoy tu voz temblo menos."
        return "Your voice was steadier today."

    @staticmethod
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
        return "; ".join(descs[:4]) if descs else ""

    async def generate_proactive_line(
        self,
        *,
        user_id: str,
        room_id: str,
        trigger: str,
        context: str,
    ) -> str:
        lang = self._room_user_lang(room_id, user_id, default="en-US")
        sync_rate = clamp01(
            to_float(self._room_user_meta.get(room_id, {}).get(user_id, {}).get("sync_rate", 0.5), 0.5)
        )
        profile = self._load_user_profile(user_id, lang, sync_rate)
        tone = str(profile.get("robot", {}).get("personality", {}).get("tone", "balanced"))
        memory = str(profile.get("ai_memory_summary", ""))[-240:]
        fallback = self._fallback_proactive_line(lang, trigger)
        client = self._get_genai_client(self._interactions_api_version)
        if client is None:
            return self._trim_proactive_line(fallback)
        prompt = (
            "You are an AR battle robot speaking a subtle internal monologue.\n"
            f"Language: {lang}\n"
            f"Tone: {tone}\n"
            f"Vision trigger: {trigger}\n"
            f"Context: {context}\n"
            f"Memory: {memory or '(none)'}\n"
            f"Rules: output exactly one sentence, <= {self._proactive_line_max_chars} characters, "
            "no advice, no imperative verbs, no quotes."
        )
        model = self._normalize_model_name(self._interactions_model, self._interactions_model)
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=prompt,
            )
            raw = self._to_json_safe(response)
            fragments: list[str] = []
            self._collect_text_fragments(raw, fragments)
            text = " ".join(dict.fromkeys(fragments)).strip()
            return self._trim_proactive_line(text or fallback)
        except Exception as exc:
            self._logger.warning(json.dumps({"event": "proactive_line_failed", "error": str(exc)}))
            return self._trim_proactive_line(fallback)

    async def _emit_victory_bgm(
        self,
        *,
        room_id: str,
        winner_id: str,
        loser_id: str,
        highlight_summary: str,
    ) -> None:
        try:
            bgm_url: str | None = None
            if self._milestone_generator is not None:
                bgm_url = await self._milestone_generator.trigger_victory_music(
                    winner_id,
                    highlight_summary,
                )
            await asyncio.sleep(max(0.0, self._bgm_ready_delay_sec))
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
            self._logger.info(
                json.dumps(
                    {
                        "event": "bgm_ready",
                        "room_id": room_id,
                        "winner": winner_id,
                        "loser": loser_id,
                        "url": bgm_url,
                    }
                )
            )
            await self._broadcast_room(room_id, payload)
        except Exception as exc:
            self._logger.warning(json.dumps({"event": "victory_bgm_emit_failed", "error": str(exc)}))

    async def _generate_winner_interview(self, room_id: str, winner_id: str, loser_id: str, loser_lang: str) -> str:
        winner_lang = self._room_user_lang(room_id, winner_id, default="en-US")
        winner_sync = clamp01(
            to_float(self._room_user_meta.get(room_id, {}).get(winner_id, {}).get("sync_rate", 0.5), 0.5)
        )
        loser_sync = clamp01(
            to_float(self._room_user_meta.get(room_id, {}).get(loser_id, {}).get("sync_rate", 0.5), 0.5)
        )
        winner_profile = self._load_user_profile(winner_id, winner_lang, winner_sync)
        loser_profile = self._load_user_profile(loser_id, loser_lang, loser_sync)
        winner_name = str(winner_profile.get("robot", {}).get("name", winner_id))
        tone = str(winner_profile.get("robot", {}).get("personality", {}).get("tone", "balanced"))
        highlights = self._recent_highlight_text(winner_profile)
        growth_line = self._voice_growth_feedback(loser_profile, loser_lang)

        client = self._get_genai_client(self._interactions_api_version)
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
        model = self._normalize_model_name(self._interactions_model, self._interactions_model)
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=prompt,
            )
            raw = self._to_json_safe(response)
            fragments: list[str] = []
            self._collect_text_fragments(raw, fragments)
            text = " ".join(dict.fromkeys(fragments)).strip()
            return text[:180] if text else fallback
        except Exception as exc:
            self._logger.warning(json.dumps({"event": "winner_interview_failed", "error": str(exc)}))
            return fallback

    async def broadcast_winner_interview_and_bgm(
        self,
        room_id: str,
        winner_id: str,
        loser_id: str,
        loser_lang: str,
    ) -> None:
        interview_text = await self._generate_winner_interview(room_id, winner_id, loser_id, loser_lang)
        self._logger.info(
            json.dumps(
                {
                    "event": "winner_interview",
                    "room_id": room_id,
                    "winner": winner_id,
                    "loser": loser_id,
                }
            )
        )
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
        await self._broadcast_room(room_id, interview_payload)
        asyncio.create_task(
            self._emit_victory_bgm(
                room_id=room_id,
                winner_id=winner_id,
                loser_id=loser_id,
                highlight_summary=interview_text,
            )
        )
