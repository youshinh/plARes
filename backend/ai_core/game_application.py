import asyncio
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from .equipment_generator import build_equipment_payload, normalize_craft_kind
from .message_contracts import validate_inbound_packet


@dataclass
class GameSessionContext:
    websocket: Any
    user_id: str
    room_id: str
    lang: str
    sync_rate: float


@dataclass
class GameApplicationDeps:
    mark_user_heartbeat: Callable[[str, str], None]
    tick_room_ex_gauge: Callable[[str], Any]
    broadcast_room: Callable[..., Any]
    validate_sync_packet: Callable[[str, str, dict[str, Any]], tuple[bool, dict[str, Any] | None]]
    record_room_event: Callable[[str, str, dict[str, Any]], None]
    record_room_sync: Callable[[str, str, dict[str, Any]], None]
    consume_special_gauge: Callable[[str, str], tuple[bool, dict[str, Any]]]
    ex_gauge_payload: Callable[[str, dict[str, Any]], dict[str, Any]]
    get_genai_client: Callable[[str], Any | None]
    interactions_api_version: str
    normalize_model_name: Callable[[str, str], str]
    ui_translation_model: str
    to_json_safe: Callable[[Any], Any]
    collect_text_fragments: Callable[[Any, list[str]], None]
    safe_json_loads: Callable[[str], dict[str, Any] | None]
    logger: Any
    issue_ephemeral_token: Callable[[dict[str, Any], str, str], Any]
    run_interaction: Callable[[dict[str, Any], str, str], Any]
    get_adk_status: Callable[[], dict[str, Any]]
    query_battle_state: Callable[[str, str], dict[str, Any]]
    propose_tactic: Callable[[str, str, str, str | None], dict[str, Any]]
    room_user_lang: Callable[[str, str, str], str]
    room_user_meta: dict[str, dict[str, dict[str, Any]]]
    clamp01: Callable[[float], float]
    to_float: Callable[[Any, float], float]
    normalize_persona_tone: Callable[[str], str]
    load_user_profile: Callable[[str, str, float], dict[str, Any]]
    append_memory_summary: Callable[[str, str], str]
    save_user_profile: Callable[[dict[str, Any]], None]
    ensure_runtime_state: Callable[[str], dict[str, Any]]
    tone_message: Callable[[str, str], str]
    profile_sync_payload: Callable[[str, dict[str, Any]], dict[str, Any]]
    run_articulation_judge: Callable[[dict[str, Any], str, str], Any]
    generate_proactive_line: Callable[..., Any]
    vision_action_for_trigger: Callable[[str], str | None]
    proactive_line_max_chars: int
    append_mode_log: Callable[..., dict[str, Any]]
    consume_spectator_intervention: Callable[[str], tuple[bool, str, float | None]]
    intervention_rejected_payload: Callable[[str, str, float | None], dict[str, Any]]
    generate_fusion_texture: Callable[[dict[str, Any]], Any]
    reject_item_distrust_threshold: int
    to_int: Callable[[Any, int], int]
    room_runtime_state: dict[str, dict[str, Any]]
    finalize_room_runtime: Callable[..., Any]
    broadcast_winner_interview_and_bgm: Callable[[str, str, str, str], Any]


class GameApplication:
    def __init__(self, deps: GameApplicationDeps) -> None:
        self._deps = deps
        self._mark_user_heartbeat = deps.mark_user_heartbeat
        self._tick_room_ex_gauge = deps.tick_room_ex_gauge
        self._broadcast_room = deps.broadcast_room
        self._validate_sync_packet = deps.validate_sync_packet
        self._record_room_event = deps.record_room_event
        self._record_room_sync = deps.record_room_sync
        self._consume_special_gauge = deps.consume_special_gauge
        self._ex_gauge_payload = deps.ex_gauge_payload
        self._get_genai_client = deps.get_genai_client
        self._interactions_api_version = deps.interactions_api_version
        self._normalize_model_name = deps.normalize_model_name
        self._ui_translation_model = deps.ui_translation_model
        self._to_json_safe = deps.to_json_safe
        self._collect_text_fragments = deps.collect_text_fragments
        self._safe_json_loads = deps.safe_json_loads
        self._logger = deps.logger
        self._issue_ephemeral_token = deps.issue_ephemeral_token
        self._run_interaction = deps.run_interaction
        self._get_adk_status = deps.get_adk_status
        self._query_battle_state = deps.query_battle_state
        self._propose_tactic = deps.propose_tactic
        self._room_user_lang = deps.room_user_lang
        self._room_user_meta = deps.room_user_meta
        self._clamp01 = deps.clamp01
        self._to_float = deps.to_float
        self._normalize_persona_tone = deps.normalize_persona_tone
        self._load_user_profile = deps.load_user_profile
        self._append_memory_summary = deps.append_memory_summary
        self._save_user_profile = deps.save_user_profile
        self._ensure_runtime_state = deps.ensure_runtime_state
        self._tone_message = deps.tone_message
        self._profile_sync_payload = deps.profile_sync_payload
        self._run_articulation_judge = deps.run_articulation_judge
        self._generate_proactive_line = deps.generate_proactive_line
        self._vision_action_for_trigger = deps.vision_action_for_trigger
        self._proactive_line_max_chars = deps.proactive_line_max_chars
        self._append_mode_log = deps.append_mode_log
        self._consume_spectator_intervention = deps.consume_spectator_intervention
        self._intervention_rejected_payload = deps.intervention_rejected_payload
        self._generate_fusion_texture = deps.generate_fusion_texture
        self._reject_item_distrust_threshold = deps.reject_item_distrust_threshold
        self._to_int = deps.to_int
        self._room_runtime_state = deps.room_runtime_state
        self._finalize_room_runtime = deps.finalize_room_runtime
        self._broadcast_winner_interview_and_bgm = deps.broadcast_winner_interview_and_bgm

    def _target_sync_rate(self, room_id: str, user_id: str, default: float) -> float:
        return self._clamp01(
            self._to_float(self._room_user_meta.get(room_id, {}).get(user_id, {}).get("sync_rate", default), default)
        )

    async def process_packet(self, payload: dict[str, Any], ctx: GameSessionContext) -> None:
        validated = validate_inbound_packet(payload)
        if validated is None:
            self._logger.warning(f"Rejected invalid inbound packet from user={ctx.user_id} room={ctx.room_id}")
            return

        payload = validated
        packet_type = payload.get("type")
        if packet_type not in {"sync", "event", "signal"}:
            return

        self._mark_user_heartbeat(ctx.room_id, ctx.user_id)
        await self._tick_room_ex_gauge(ctx.room_id)

        if packet_type == "signal":
            await self._handle_signal(payload, ctx)
            return
        if packet_type == "sync":
            await self._handle_sync(payload, ctx)
            return
        await self._handle_event(payload, ctx)

    async def _handle_signal(self, payload: dict[str, Any], ctx: GameSessionContext) -> None:
        signal_data = payload.get("data")
        if not isinstance(signal_data, dict):
            return
        signal_data["from"] = ctx.user_id
        payload["data"] = signal_data
        target_user = signal_data.get("to")
        kind = signal_data.get("kind")
        if kind in {"offer", "answer", "ice"} and not target_user:
            return
        await self._broadcast_room(
            ctx.room_id,
            payload,
            exclude=ctx.websocket,
            target_user=target_user,
        )

    async def _handle_sync(self, payload: dict[str, Any], ctx: GameSessionContext) -> None:
        sync_data = payload.get("data")
        if isinstance(sync_data, dict):
            sync_data["userId"] = ctx.user_id
            payload["data"] = sync_data
            valid, correction = self._validate_sync_packet(ctx.room_id, ctx.user_id, sync_data)
            if not valid:
                correction_event = {
                    "type": "event",
                    "data": {
                        "event": "state_correction",
                        "user": "server",
                        "target": ctx.user_id,
                        "payload": correction or {"kind": "state_correction"},
                    },
                }
                await self._broadcast_room(ctx.room_id, correction_event)
                self._record_room_event(ctx.room_id, ctx.user_id, correction_event["data"])
                return
            self._record_room_sync(ctx.room_id, ctx.user_id, sync_data)
        await self._broadcast_room(ctx.room_id, payload, exclude=ctx.websocket)

    async def _handle_event(self, payload: dict[str, Any], ctx: GameSessionContext) -> None:
        event_data = payload.get("data")
        if not isinstance(event_data, dict):
            await self._broadcast_room(ctx.room_id, payload, exclude=ctx.websocket)
            return

        event_data["user"] = ctx.user_id
        payload["data"] = event_data
        payload_obj = event_data.get("payload")

        if event_data.get("event") == "heartbeat":
            self._mark_user_heartbeat(ctx.room_id, ctx.user_id)
            return

        if (
            event_data.get("event") == "buff_applied"
            and isinstance(payload_obj, dict)
            and payload_obj.get("action") == "casting_special"
        ):
            consumed, updated_metrics = self._consume_special_gauge(ctx.room_id, ctx.user_id)
            if not consumed:
                rejected = {
                    "type": "event",
                    "data": {
                        "event": "buff_applied",
                        "user": "server",
                        "target": ctx.user_id,
                        "payload": {
                            "kind": "special_not_ready",
                            "message": "EX gauge is not full yet.",
                        },
                    },
                }
                await self._broadcast_room(ctx.room_id, rejected, target_user=ctx.user_id)
                return
            await self._broadcast_room(
                ctx.room_id,
                self._ex_gauge_payload(ctx.user_id, updated_metrics),
                target_user=ctx.user_id,
            )

        if (
            event_data.get("event") == "request_ui_translations"
            and isinstance(payload_obj, dict)
        ):
            await self._handle_ui_translations(payload_obj, ctx)
            return

        if (
            event_data.get("event") == "request_ephemeral_token"
            and isinstance(payload_obj, dict)
        ):
            token_result = await self._issue_ephemeral_token(payload_obj, ctx.user_id, ctx.room_id)
            token_result["request_id"] = payload_obj.get("request_id")
            wrapped = {
                "type": "event",
                "data": {
                    "event": "buff_applied",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": token_result,
                },
            }
            await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])
            return

        if (
            event_data.get("event") == "request_adk_status"
            and isinstance(payload_obj, dict)
        ):
            status_result = self._get_adk_status()
            status_result["request_id"] = payload_obj.get("request_id")
            wrapped = {
                "type": "event",
                "data": {
                    "event": "buff_applied",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": status_result,
                },
            }
            await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])
            return

        if (
            event_data.get("event") == "request_battle_state_snapshot"
            and isinstance(payload_obj, dict)
        ):
            snapshot_result = self._query_battle_state(ctx.room_id, ctx.user_id)
            snapshot_result["request_id"] = payload_obj.get("request_id")
            wrapped = {
                "type": "event",
                "data": {
                    "event": "buff_applied",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": snapshot_result,
                },
            }
            await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])
            return

        if (
            event_data.get("event") == "request_tactical_recommendation"
            and isinstance(payload_obj, dict)
        ):
            tactic_result = self._propose_tactic(
                ctx.room_id,
                ctx.user_id,
                str(payload_obj.get("action", "observe")),
                str(payload_obj.get("target")) if payload_obj.get("target") is not None else None,
            )
            tactic_result["request_id"] = payload_obj.get("request_id")
            wrapped = {
                "type": "event",
                "data": {
                    "event": "buff_applied",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": tactic_result,
                },
            }
            await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])
            return

        if (
            event_data.get("event") == "interaction_turn"
            and isinstance(payload_obj, dict)
        ):
            interaction_result = await self._run_interaction(payload_obj, ctx.user_id, ctx.room_id)
            interaction_result["request_id"] = payload_obj.get("request_id")
            wrapped = {
                "type": "event",
                "data": {
                    "event": "buff_applied",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": interaction_result,
                },
            }
            await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])
            return

        if (
            event_data.get("event") == "persona_shift_request"
            and isinstance(payload_obj, dict)
        ):
            await self._handle_persona_shift(event_data, payload_obj, ctx)
            return

        if (
            event_data.get("event") == "incantation_submitted"
            and isinstance(payload_obj, dict)
        ):
            await self._handle_incantation(event_data, payload_obj, ctx)
            return

        if (
            event_data.get("event") == "dna_ab_feedback"
            and isinstance(payload_obj, dict)
        ):
            await self._handle_dna_ab_feedback(event_data, payload_obj, ctx)
            return

        if (
            event_data.get("event") == "walk_vision_trigger"
            and isinstance(payload_obj, dict)
        ):
            await self._handle_walk_vision_trigger(event_data, payload_obj, ctx)
            return

        if (
            event_data.get("event") == "buff_applied"
            and isinstance(payload_obj, dict)
            and payload_obj.get("kind") == "training_complete"
        ):
            refreshed_profile = self._append_mode_log(
                user_id=ctx.user_id,
                lang=ctx.lang,
                sync_rate=ctx.sync_rate,
                mode="training",
                payload=payload_obj,
            )
            await self._broadcast_room(
                ctx.room_id,
                self._profile_sync_payload(ctx.user_id, refreshed_profile),
                target_user=ctx.user_id,
            )
            return

        if (
            event_data.get("event") == "buff_applied"
            and isinstance(payload_obj, dict)
            and payload_obj.get("kind") == "walk_complete"
        ):
            refreshed_profile = self._append_mode_log(
                user_id=ctx.user_id,
                lang=ctx.lang,
                sync_rate=ctx.sync_rate,
                mode="walk",
                payload=payload_obj,
            )
            await self._broadcast_room(
                ctx.room_id,
                self._profile_sync_payload(ctx.user_id, refreshed_profile),
                target_user=ctx.user_id,
            )
            return

        if (
            event_data.get("event") == "buff_applied"
            and isinstance(payload_obj, dict)
            and payload_obj.get("kind") == "request_profile_sync"
        ):
            refreshed_profile = self._load_user_profile(ctx.user_id, ctx.lang, ctx.sync_rate)
            await self._broadcast_room(
                ctx.room_id,
                self._profile_sync_payload(ctx.user_id, refreshed_profile),
                target_user=ctx.user_id,
            )
            return

        if (
            event_data.get("event") == "item_dropped"
            and isinstance(payload_obj, dict)
            and str(payload_obj.get("action", "")).strip().lower() == "reject_item"
        ):
            await self._handle_reject_item(event_data, payload_obj, ctx)
            return

        if (
            event_data.get("event") == "item_dropped"
            and isinstance(payload_obj, dict)
            and bool(payload_obj.get("craft_request"))
        ):
            await self._handle_craft_request(event_data, payload_obj, ctx)
            return

        if event_data.get("event") == "match_end":
            await self._handle_match_end(payload, event_data, ctx)
            return

        self._record_room_event(ctx.room_id, ctx.user_id, event_data)
        await self._broadcast_room(ctx.room_id, payload, exclude=ctx.websocket)

    async def _handle_ui_translations(self, payload_obj: dict[str, Any], ctx: GameSessionContext) -> None:
        target_lang = str(payload_obj.get("lang", ctx.lang) or ctx.lang).strip()
        base_keys: dict[str, Any] = payload_obj.get("base_keys", {})
        if not isinstance(base_keys, dict) or not base_keys:
            return
        translations: dict[str, Any] = {}
        client = self._get_genai_client(self._interactions_api_version)
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
                model = self._normalize_model_name(self._ui_translation_model, self._ui_translation_model)
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model,
                    contents=prompt,
                )
                raw = self._to_json_safe(response)
                fragments: list[str] = []
                self._collect_text_fragments(raw, fragments)
                text = " ".join(dict.fromkeys(fragments)).strip()
                if text:
                    parsed = self._safe_json_loads(text)
                    if isinstance(parsed, dict):
                        translations = parsed
            except Exception as exc:
                self._logger.warning(
                    json.dumps(
                        {
                            "event": "ui_translations_error",
                            "lang": target_lang,
                            "error": str(exc),
                        }
                    )
                )
        if not translations:
            translations = dict(base_keys)
        wrapped = {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": ctx.user_id,
                "payload": {
                    "kind": "ui_translations",
                    "lang": target_lang,
                    "translations": translations,
                },
            },
        }
        await self._broadcast_room(ctx.room_id, wrapped, target_user=ctx.user_id)
        self._logger.info(
            json.dumps(
                {
                    "event": "ui_translations_generated",
                    "lang": target_lang,
                    "key_count": len(translations),
                }
            )
        )

    async def _handle_persona_shift(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        target_user = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        target_lang = self._room_user_lang(ctx.room_id, target_user, default=ctx.lang)
        target_sync_rate = self._target_sync_rate(ctx.room_id, target_user, ctx.sync_rate)
        prompt = str(payload_obj.get("prompt", payload_obj.get("tone", payload_obj.get("style", "")))).strip()
        requested_tone = self._normalize_persona_tone(prompt or "balanced")

        profile = self._load_user_profile(target_user, target_lang, target_sync_rate)
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
        profile["ai_memory_summary"] = self._append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            f"{datetime.now(timezone.utc).isoformat()} persona_shift: {requested_tone}",
        )
        self._save_user_profile(profile)
        self._ensure_runtime_state(ctx.room_id)["per_user"][target_user]["tone"] = requested_tone

        tone_payload = {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": target_user,
                "payload": {
                    "kind": "persona_tone",
                    "tone": requested_tone,
                    "message": self._tone_message(target_lang, requested_tone),
                    "prompt": prompt,
                    "previous_tone": previous_tone,
                },
            },
        }
        await self._broadcast_room(ctx.room_id, tone_payload)
        self._record_room_event(ctx.room_id, target_user, tone_payload["data"])
        await self._broadcast_room(
            ctx.room_id,
            self._profile_sync_payload(target_user, profile),
            target_user=target_user,
        )

    async def _handle_incantation(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        judge_result = await self._run_articulation_judge(payload_obj, ctx.user_id, ctx.room_id)
        target_user = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        target_lang = self._room_user_lang(ctx.room_id, target_user, default=ctx.lang)
        current_meta = self._room_user_meta.get(ctx.room_id, {}).get(target_user, {})
        target_sync_rate = self._to_float(current_meta.get("sync_rate", ctx.sync_rate), ctx.sync_rate)
        profile = self._load_user_profile(target_user, target_lang, target_sync_rate)

        if judge_result.get("ok"):
            gain = judge_result.get("sync_gain", 0.0)
            new_sync = self._clamp01(target_sync_rate + gain)
            profile["sync_rate"] = new_sync
            logs = profile.get("training_logs", [])
            if not isinstance(logs, list):
                logs = []
            logs.append(
                {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "phrase": judge_result.get("phrase"),
                    "scores": {
                        "acc": judge_result.get("accuracy"),
                        "spd": judge_result.get("speed"),
                        "pas": judge_result.get("passion"),
                    },
                    "gain": gain,
                }
            )
            profile["training_logs"] = logs[-50:]
            profile["ai_memory_summary"] = self._append_memory_summary(
                str(profile.get("ai_memory_summary", "")),
                f"{datetime.now(timezone.utc).isoformat()} training: phrase='{judge_result.get('phrase')}', "
                f"verdict={judge_result.get('verdict')}, sync_gain={gain:.3f}",
            )
            self._save_user_profile(profile)
            if ctx.room_id in self._room_user_meta and target_user in self._room_user_meta[ctx.room_id]:
                self._room_user_meta[ctx.room_id][target_user]["sync_rate"] = new_sync

        wrapped = {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": target_user,
                "payload": judge_result,
            },
        }
        await self._broadcast_room(ctx.room_id, wrapped, target_user=target_user)
        self._record_room_event(ctx.room_id, ctx.user_id, wrapped["data"])

    async def _handle_dna_ab_feedback(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        target_user = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        target_lang = self._room_user_lang(ctx.room_id, target_user, default=ctx.lang)
        target_sync_rate = self._target_sync_rate(ctx.room_id, target_user, ctx.sync_rate)
        profile = self._load_user_profile(target_user, target_lang, target_sync_rate)
        logs = profile.get("dna_ab_tests", [])
        if not isinstance(logs, list):
            logs = []

        choice = str(payload_obj.get("choice", "A")).strip().upper()
        if choice not in {"A", "B"}:
            choice = "A"
        note = str(payload_obj.get("note", "")).strip()[:120]
        score_a = self._to_float(payload_obj.get("scoreA", payload_obj.get("score_a", 0.0)), 0.0)
        score_b = self._to_float(payload_obj.get("scoreB", payload_obj.get("score_b", 0.0)), 0.0)
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
        profile["ai_memory_summary"] = self._append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            f"{entry['timestamp']} dna_ab: choose={choice}, scoreA={score_a:.2f}, scoreB={score_b:.2f}",
        )
        self._save_user_profile(profile)
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
        await self._broadcast_room(ctx.room_id, ack, target_user=target_user)
        self._record_room_event(ctx.room_id, target_user, ack["data"])

    async def _handle_walk_vision_trigger(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        target_user = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        trigger = str(payload_obj.get("trigger", payload_obj.get("kind", payload_obj.get("scene", "environment")))).strip().lower()
        if not trigger:
            trigger = "environment"
        context = str(payload_obj.get("context", payload_obj.get("summary", ""))).strip()
        proactive_text = await self._generate_proactive_line(
            user_id=target_user,
            room_id=ctx.room_id,
            trigger=trigger,
            context=context,
        )
        action = self._vision_action_for_trigger(trigger)
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
                    "max_chars": self._proactive_line_max_chars,
                    "action": action,
                },
            },
        }
        await self._broadcast_room(ctx.room_id, proactive_payload)
        self._record_room_event(ctx.room_id, target_user, proactive_payload["data"])

        target_lang = self._room_user_lang(ctx.room_id, target_user, default=ctx.lang)
        target_sync_rate = self._target_sync_rate(ctx.room_id, target_user, ctx.sync_rate)
        profile = self._load_user_profile(target_user, target_lang, target_sync_rate)
        profile["ai_memory_summary"] = self._append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            f"{datetime.now(timezone.utc).isoformat()} proactive({trigger}): {proactive_text}",
        )
        self._save_user_profile(profile)

    async def _handle_reject_item(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        target_user = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        target_lang = self._room_user_lang(ctx.room_id, target_user, default=ctx.lang)
        target_sync_rate = self._target_sync_rate(ctx.room_id, target_user, ctx.sync_rate)
        reason = str(payload_obj.get("reason", "not_my_style")).strip() or "not_my_style"

        profile = self._load_user_profile(target_user, target_lang, target_sync_rate)
        robot = profile.get("robot", {})
        if not isinstance(robot, dict):
            robot = {}
        personality = robot.get("personality", {})
        if not isinstance(personality, dict):
            personality = {}
        old_tone = str(personality.get("tone", "balanced"))
        reject_count = self._to_int(personality.get("reject_item_count", payload_obj.get("reject_count", 0)), 0) + 1
        personality["reject_item_count"] = reject_count
        if reject_count >= self._reject_item_distrust_threshold:
            personality["tone"] = "distrustful"
        new_tone = str(personality.get("tone", old_tone))
        robot["personality"] = personality
        profile["robot"] = robot
        profile["ai_memory_summary"] = self._append_memory_summary(
            str(profile.get("ai_memory_summary", "")),
            f"{datetime.now(timezone.utc).isoformat()} reject_item: count={reject_count}, reason={reason}",
        )
        self._save_user_profile(profile)
        self._ensure_runtime_state(ctx.room_id)["per_user"][target_user]["tone"] = new_tone

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
                    "threshold": self._reject_item_distrust_threshold,
                    "tone": new_tone,
                },
            },
        }
        await self._broadcast_room(ctx.room_id, rejected_payload)
        self._record_room_event(ctx.room_id, target_user, rejected_payload["data"])

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
                        "message": self._tone_message(target_lang, new_tone),
                        "reject_count": reject_count,
                    },
                },
            }
            await self._broadcast_room(ctx.room_id, tone_payload)
            self._record_room_event(ctx.room_id, target_user, tone_payload["data"])

        await self._broadcast_room(
            ctx.room_id,
            self._profile_sync_payload(target_user, profile),
            target_user=target_user,
        )

    async def _handle_craft_request(
        self,
        event_data: dict[str, Any],
        payload_obj: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        request_id = str(payload_obj.get("request_id", "")).strip()
        allowed, reason, retry_after = self._consume_spectator_intervention(ctx.room_id)
        if not allowed:
            rejected = self._intervention_rejected_payload(ctx.user_id, reason, retry_after)
            rejected_payload = rejected.get("data", {}).get("payload")
            if isinstance(rejected_payload, dict) and request_id:
                rejected_payload["request_id"] = request_id
            await self._broadcast_room(ctx.room_id, rejected, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, rejected["data"])
            return

        try:
            texture_url = await self._generate_fusion_texture(payload_obj)
        except Exception as exc:
            failed = {
                "type": "event",
                "data": {
                    "event": "item_dropped",
                    "user": "server",
                    "target": ctx.user_id,
                    "payload": {
                        "kind": "fused_item_error",
                        "request_id": request_id,
                        "error": "fusion_generation_failed",
                        "message": str(exc),
                    },
                },
            }
            await self._broadcast_room(ctx.room_id, failed, target_user=ctx.user_id)
            self._record_room_event(ctx.room_id, ctx.user_id, failed["data"])
            return

        target_id = str(event_data.get("target", ctx.user_id) or ctx.user_id)
        concept = str(payload_obj.get("concept", "legendary item"))
        craft_kind = normalize_craft_kind(payload_obj.get("craft_kind"))
        equipment_payload = build_equipment_payload(craft_kind, payload_obj.get("mount_point"))
        target_lang = self._room_user_lang(ctx.room_id, target_id, default="ja-JP")
        target_sync_rate = self._target_sync_rate(ctx.room_id, target_id, 0.5)

        generated_event = {
            "event": "item_dropped",
            "user": "server",
            "target": target_id,
            "payload": {
                "kind": "fused_item",
                "requested_by": ctx.user_id,
                "request_id": request_id,
                "concept": concept,
                "texture_url": texture_url,
                "action": equipment_payload["action"],
                "mount_point": equipment_payload["mount_point"],
                "scale": equipment_payload["scale"],
            },
        }
        generated = {
            "type": "event",
            "data": generated_event,
        }
        await self._broadcast_room(ctx.room_id, generated)

        profile = self._load_user_profile(target_id, target_lang, target_sync_rate)
        inventory = profile.get("inventory", [])
        if not isinstance(inventory, list):
            inventory = []
        inventory.append(
            {
                "id": f"fused_{int(time.time())}",
                "name": f"Fused: {concept}",
                "url": texture_url,
                "type": equipment_payload["inventory_type"],
                "mount_point": equipment_payload["mount_point"],
                "action": equipment_payload["action"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        profile["inventory"] = inventory[-20:]
        self._save_user_profile(profile)

        await self._broadcast_room(
            ctx.room_id,
            self._profile_sync_payload(target_id, profile),
            target_user=target_id,
        )
        self._record_room_event(ctx.room_id, ctx.user_id, generated_event)

    async def _handle_match_end(
        self,
        payload: dict[str, Any],
        event_data: dict[str, Any],
        ctx: GameSessionContext,
    ) -> None:
        self._record_room_event(ctx.room_id, ctx.user_id, event_data)
        room_state = self._room_runtime_state.get(ctx.room_id, {})
        per_user = room_state.get("per_user", {})
        raw_combatants = room_state.get("combatants", [])
        combatants = [str(uid) for uid in raw_combatants if str(uid) in per_user]
        if not combatants:
            combatants = [str(uid) for uid in per_user.keys()][:2]
        self._finalize_room_runtime(ctx.room_id, trigger="match_end")
        await self._broadcast_room(ctx.room_id, payload)

        winner_id = None
        loser_id = None
        loser_lang = "en-US"
        for user_id in combatants:
            metrics = per_user.get(user_id, {})
            criticals = int(metrics.get("critical_hits", 0))
            misses = int(metrics.get("misses", 0))
            if criticals >= misses:
                winner_id = user_id
            else:
                loser_id = user_id
                loser_lang = str(metrics.get("lang", "en-US"))

        if winner_id and loser_id:
            await self._broadcast_winner_interview_and_bgm(
                ctx.room_id,
                winner_id,
                loser_id,
                loser_lang,
            )
