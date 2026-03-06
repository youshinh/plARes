import pytest

from ai_core.ws_router import parse_audio_identity, parse_game_identity, resolve_request_path, route_websocket_connection


class DummyWebSocket:
    def __init__(self):
        self.sent = []

    async def send(self, text):
        self.sent.append(text)


def test_parse_game_identity_clamps_sync_rate():
    user_id, room_id, lang, sync_rate = parse_game_identity(
        "/ws/game?user_id=u1&room_id=r1&lang=ja-JP&sync_rate=1.7",
        lambda value: max(0.0, min(1.0, value)),
    )

    assert (user_id, room_id, lang, sync_rate) == ("u1", "r1", "ja-JP", 1.0)


def test_parse_audio_identity_uses_default_user_prefix():
    user_id, room_id, lang, sync_rate = parse_audio_identity(
        "/ws/audio?room_id=r1",
        lambda value: max(0.0, min(1.0, value)),
    )

    assert user_id.startswith("audio_")
    assert room_id == "r1"
    assert lang == "en-US"
    assert sync_rate == 0.5


def test_resolve_request_path_reads_request_object():
    class Request:
        path = "/ws/game?room_id=r1"

    class RequestWebSocket:
        request = Request()

    assert resolve_request_path(RequestWebSocket()) == "/ws/game?room_id=r1"


@pytest.mark.asyncio
async def test_route_websocket_connection_sends_unsupported_error():
    ws = DummyWebSocket()

    async def noop_handler(_websocket, _path):
        raise AssertionError("should not be called")

    await route_websocket_connection(
        ws,
        path="/unknown",
        character_path="/ws/character",
        game_path="/ws/game",
        audio_path="/ws/audio",
        live_path="/ws/live",
        character_handler=noop_handler,
        game_handler=noop_handler,
        audio_handler=noop_handler,
        live_handler=None,
        live_import_error="not_loaded",
    )

    assert ws.sent
    assert "Unsupported path" in ws.sent[-1]


@pytest.mark.asyncio
async def test_route_websocket_connection_dispatches_live_handler():
    ws = DummyWebSocket()
    calls = []

    async def noop_handler(_websocket, _path):
        raise AssertionError("should not be called")

    async def live_handler(client_id, websocket):
        calls.append((client_id, websocket))

    await route_websocket_connection(
        ws,
        path="/ws/live",
        character_path="/ws/character",
        game_path="/ws/game",
        audio_path="/ws/audio",
        live_path="/ws/live",
        character_handler=noop_handler,
        game_handler=noop_handler,
        audio_handler=noop_handler,
        live_handler=live_handler,
        live_import_error="not_loaded",
    )

    assert len(calls) == 1
    assert calls[0][1] is ws
