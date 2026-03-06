import json
from collections import defaultdict

import pytest

from ai_core.game_session_service import GameSessionService


class AsyncIterWebSocket:
    def __init__(self, messages):
        self._messages = list(messages)
        self.sent = []

    def __aiter__(self):
        self._iter = iter(self._messages)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc

    async def send(self, text):
        self.sent.append(text)


class DummyLogger:
    def __init__(self):
        self.messages = []

    def info(self, message):
        self.messages.append(message)


class DummyGameApplication:
    def __init__(self):
        self.calls = []

    async def process_packet(self, payload, ctx):
        self.calls.append((payload, ctx))


class DummyVertexCache:
    def __init__(self):
        self.calls = []

    async def load_historical_context(self, user_id, sys_inst, contents):
        self.calls.append((user_id, sys_inst, contents))


@pytest.mark.asyncio
async def test_game_session_sends_initial_payloads_and_processes_packets():
    registered = []
    saved = []
    cleaned = []
    rosters = []
    game_app = DummyGameApplication()
    vertex_cache = DummyVertexCache()
    logger = DummyLogger()

    async def broadcast_roster(room_id):
        rosters.append(room_id)

    service = GameSessionService(
        parse_identity=lambda _path: ("u1", "room-1", "ja-JP", 0.6),
        register_game_client=lambda *args: registered.append(args),
        load_user_profile=lambda *_args: {
            "user_id": "u1",
            "pending_milestone": 5,
            "robot": {"personality": {"tone": "balanced"}, "network": {"sync_rate": 0.6}},
            "ai_memory_summary": "summary",
            "match_logs": [],
        },
        save_user_profile=lambda profile: saved.append(dict(profile)),
        ensure_user_battle_metrics=lambda *_args: {"hp": 100, "max_hp": 180},
        vertex_cache_instance=vertex_cache,
        room_members=defaultdict(set, {"room-1": {object()}}),
        logger=logger,
        profile_sync_payload=lambda user_id, _profile: {"type": "event", "data": {"target": user_id, "payload": {"kind": "profile_sync"}}},
        milestone_payload=lambda user_id, total_matches: {"type": "event", "data": {"target": user_id, "payload": {"kind": "milestone_notice", "total_matches": total_matches}}},
        initial_tactics_payload=lambda lang: {"type": "event", "data": {"payload": {"kind": "tactics", "lang": lang}}},
        battle_status_payload=lambda user_id, metrics: {"type": "event", "data": {"target": user_id, "payload": {"kind": "battle_status", **metrics}}},
        roster_payload=lambda room_id: {"type": "signal", "data": {"kind": "roster", "room": room_id}},
        broadcast_roster=broadcast_roster,
        cleanup_game_client=lambda websocket: cleaned.append(websocket) or False,
        safe_json_loads=lambda text: json.loads(text),
        game_application=game_app,
        session_context_factory=lambda **kwargs: kwargs,
        connection_closed_exception=Exception,
    )

    ws = AsyncIterWebSocket([json.dumps({"type": "event", "data": {"event": "heartbeat"}})])

    await service.handle_connection(ws, "/ws/game?user_id=u1&room_id=room-1")

    assert registered
    assert len(ws.sent) == 5
    assert json.loads(ws.sent[0])["data"]["payload"]["kind"] == "profile_sync"
    assert json.loads(ws.sent[1])["data"]["payload"]["kind"] == "milestone_notice"
    assert json.loads(ws.sent[2])["data"]["payload"]["kind"] == "tactics"
    assert json.loads(ws.sent[3])["data"]["payload"]["kind"] == "battle_status"
    assert json.loads(ws.sent[4])["data"]["kind"] == "roster"
    assert rosters == ["room-1", "room-1"]
    assert cleaned == [ws]
    assert game_app.calls[0][0]["data"]["event"] == "heartbeat"
    assert saved[-1]["pending_milestone"] == 0
