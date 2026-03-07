from collections import defaultdict
import json

import pytest

from ai_core.game_application import GameApplication, GameApplicationDeps, GameSessionContext


class BroadcastRecorder:
    def __init__(self):
        self.calls = []

    async def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))


class DummyLogger:
    def __init__(self):
        self.warnings = []

    def info(self, _message: str) -> None:
        pass

    def warning(self, message: str) -> None:
        self.warnings.append(message)


def build_app(*, get_genai_client=None, safe_json_loads=None):
    broadcast = BroadcastRecorder()
    events = []
    syncs = []
    logger = DummyLogger()
    room_user_meta = defaultdict(dict, {"room-1": {"u1": {"sync_rate": 0.5, "lang": "en-US"}}})

    async def noop_async(*_args, **_kwargs):
        return None

    async def issue_ephemeral_token(*_args, **_kwargs):
        return {"kind": "live_ephemeral_token", "ok": True}

    async def run_interaction(*_args, **_kwargs):
        return {"kind": "interaction_response", "ok": True}

    async def run_articulation_judge(*_args, **_kwargs):
        return {"ok": True, "sync_gain": 0.1, "phrase": "Burst", "accuracy": 0.8, "speed": 0.7, "passion": 0.9, "verdict": "critical"}

    async def generate_fusion_texture(*_args, **_kwargs):
        return "https://example.com/fused.png"

    def append_mode_log(**kwargs):
        return {"user_id": kwargs["user_id"], "robot": {}, "match_logs": [], "training_logs": [], "walk_logs": [], "dna_ab_tests": []}

    deps = GameApplicationDeps(
        mark_user_heartbeat=lambda *_args: None,
        tick_room_ex_gauge=noop_async,
        broadcast_room=broadcast,
        validate_sync_packet=lambda *_args: (True, None),
        record_room_event=lambda *args: events.append(args),
        record_room_sync=lambda *args: syncs.append(args),
        consume_special_gauge=lambda *_args: (True, {"ex_gauge": 0, "special_ready": False, "hp": 100, "max_hp": 100, "heat_active": False}),
        ex_gauge_payload=lambda user_id, _metrics: {"type": "event", "data": {"target": user_id}},
        get_genai_client=get_genai_client or (lambda *_args: None),
        interactions_api_version="v1alpha",
        normalize_model_name=lambda model, _fallback: model,
        ui_translation_model="gemini-flash-lite-latest",
        to_json_safe=lambda value: value,
        collect_text_fragments=lambda _value, _fragments: None,
        safe_json_loads=safe_json_loads or (lambda text: {"parsed": text}),
        logger=logger,
        issue_ephemeral_token=issue_ephemeral_token,
        run_interaction=run_interaction,
        get_adk_status=lambda: {"kind": "adk_status", "available": True, "detail": ""},
        query_battle_state=lambda _room_id, user_id: {"kind": "battle_state_snapshot", "ok": True, "user_id": user_id, "hp": 100},
        propose_tactic=lambda _room_id, user_id, action, target=None: {
            "kind": "tactical_recommendation",
            "ok": True,
            "user_id": user_id,
            "action": action,
            "target": target,
        },
        room_user_lang=lambda _room_id, _user_id, default="en-US": default,
        room_user_meta=room_user_meta,
        clamp01=lambda value: max(0.0, min(1.0, float(value))),
        to_float=lambda value, default=0.0: float(value) if value is not None else default,
        normalize_persona_tone=lambda prompt: prompt or "balanced",
        load_user_profile=lambda *_args: {"user_id": "u1", "robot": {}, "match_logs": [], "training_logs": [], "walk_logs": [], "dna_ab_tests": [], "ai_memory_summary": ""},
        append_memory_summary=lambda existing, entry: f"{existing}\n{entry}".strip(),
        save_user_profile=lambda *_args: None,
        ensure_runtime_state=lambda _room_id: {"per_user": defaultdict(dict)},
        tone_message=lambda _lang, tone: tone,
        profile_sync_payload=lambda user_id, profile: {"type": "event", "data": {"event": "buff_applied", "target": user_id, "payload": {"kind": "profile_sync", "profile": profile}}},
        run_articulation_judge=run_articulation_judge,
        generate_proactive_line=lambda **_kwargs: "Night falls.",
        vision_action_for_trigger=lambda trigger: "glow_eyes" if trigger == "darkness" else None,
        proactive_line_max_chars=15,
        append_mode_log=append_mode_log,
        consume_spectator_intervention=lambda *_args: (True, "", None),
        intervention_rejected_payload=lambda *_args: {"type": "event", "data": {"event": "intervention_rejected"}},
        generate_fusion_texture=generate_fusion_texture,
        reject_item_distrust_threshold=3,
        to_int=lambda value, default=0: int(value) if value is not None else default,
        room_runtime_state={},
        finalize_room_runtime=lambda *_args, **_kwargs: None,
        broadcast_winner_interview_and_bgm=noop_async,
    )
    return GameApplication(deps), broadcast, logger


@pytest.mark.asyncio
async def test_request_ui_translations_falls_back_to_base_keys():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "request_ui_translations",
                "payload": {"lang": "fr-FR", "base_keys": {"start": "Start"}},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    payload = broadcast.calls[-1][0][1]["data"]["payload"]
    assert payload["kind"] == "ui_translations"
    assert payload["translations"] == {"start": "Start"}


@pytest.mark.asyncio
async def test_request_ui_translations_uses_response_text_json():
    class DummyResponse:
        text = '{"start":"Demarrer"}'

    class DummyModels:
        def generate_content(self, **_kwargs):
            return DummyResponse()

    class DummyClient:
        models = DummyModels()

    app, broadcast, _logger = build_app(
        get_genai_client=lambda *_args: DummyClient(),
        safe_json_loads=lambda text: json.loads(text),
    )

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "request_ui_translations",
                "payload": {"lang": "fr-FR", "base_keys": {"start": "Start"}},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    payload = broadcast.calls[-1][0][1]["data"]["payload"]
    assert payload["kind"] == "ui_translations"
    assert payload["translations"] == {"start": "Demarrer"}


@pytest.mark.asyncio
async def test_training_complete_broadcasts_profile_sync():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "payload": {"kind": "training_complete", "sessionId": "training_1"},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    wrapped = broadcast.calls[-1][0][1]
    assert wrapped["data"]["payload"]["kind"] == "profile_sync"
    assert wrapped["data"]["target"] == "u1"


@pytest.mark.asyncio
async def test_request_profile_sync_loads_and_broadcasts_profile():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "payload": {"kind": "request_profile_sync"},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    wrapped = broadcast.calls[-1][0][1]
    assert wrapped["data"]["payload"]["kind"] == "profile_sync"


@pytest.mark.asyncio
async def test_request_adk_status_broadcasts_result():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "request_adk_status",
                "payload": {"request_id": "req_123"},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    wrapped = broadcast.calls[-1][0][1]
    assert wrapped["data"]["payload"]["kind"] == "adk_status"
    assert wrapped["data"]["payload"]["available"] is True
    assert wrapped["data"]["payload"]["request_id"] == "req_123"


@pytest.mark.asyncio
async def test_request_battle_state_snapshot_broadcasts_result():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "request_battle_state_snapshot",
                "payload": {"request_id": "req_state"},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    wrapped = broadcast.calls[-1][0][1]
    assert wrapped["data"]["payload"]["kind"] == "battle_state_snapshot"
    assert wrapped["data"]["payload"]["request_id"] == "req_state"


@pytest.mark.asyncio
async def test_request_tactical_recommendation_broadcasts_result():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "request_tactical_recommendation",
                "payload": {"request_id": "req_tactic", "action": "take_cover", "target": "u2"},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    wrapped = broadcast.calls[-1][0][1]
    assert wrapped["data"]["payload"]["kind"] == "tactical_recommendation"
    assert wrapped["data"]["payload"]["action"] == "take_cover"
    assert wrapped["data"]["payload"]["target"] == "u2"
    assert wrapped["data"]["payload"]["request_id"] == "req_tactic"


@pytest.mark.asyncio
async def test_craft_request_can_generate_attachment_payload():
    app, broadcast, _logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "item_dropped",
                "user": "u1",
                "payload": {
                    "craft_request": True,
                    "request_id": "req_attach",
                    "concept": "spring roll blade",
                    "craft_kind": "attachment",
                    "mount_point": "HEAD_ACCESSORY",
                    "image_data": "ZmFrZQ==",
                },
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    payload = next(
        call_args[1]["data"]["payload"]
        for call_args, _call_kwargs in broadcast.calls
        if len(call_args) > 1
        and isinstance(call_args[1], dict)
        and isinstance(call_args[1].get("data"), dict)
        and isinstance(call_args[1]["data"].get("payload"), dict)
        and call_args[1]["data"]["payload"].get("kind") == "fused_item"
    )
    assert payload["kind"] == "fused_item"
    assert payload["action"] == "attach"
    assert payload["mount_point"] == "HEAD_ACCESSORY"


@pytest.mark.asyncio
async def test_invalid_packet_is_rejected_before_processing():
    app, broadcast, logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {"payload": {"kind": "missing_event_name"}},
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    assert broadcast.calls == []
    assert logger.warnings


@pytest.mark.asyncio
async def test_invalid_interaction_turn_payload_is_rejected():
    app, broadcast, logger = build_app()

    await app.process_packet(
        {
            "type": "event",
            "data": {
                "event": "interaction_turn",
                "payload": {"store": True},
            },
        },
        GameSessionContext(websocket=object(), user_id="u1", room_id="room-1", lang="en-US", sync_rate=0.5),
    )

    assert broadcast.calls == []
    assert logger.warnings
