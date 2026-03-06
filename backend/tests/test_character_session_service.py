import json

import pytest

from ai_core.character_session_service import CharacterSessionService


class DummyWebSocket:
    def __init__(self, message):
        self._message = message
        self.sent = []
        self.closed = False

    async def recv(self):
        return self._message

    async def send(self, text):
        self.sent.append(text)

    async def close(self):
        self.closed = True


class DummyLogger:
    def __init__(self):
        self.errors = []

    def error(self, message, exc_info=False):
        self.errors.append((message, exc_info))


@pytest.mark.asyncio
async def test_character_session_returns_generated_payload():
    logger = DummyLogger()

    async def generate_robot_stats(**kwargs):
        return {"ok": True, "received": kwargs}

    service = CharacterSessionService(
        safe_json_loads=lambda text: json.loads(text),
        generate_robot_stats=generate_robot_stats,
        logger=logger,
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket(json.dumps({"face_image_base64": "abc", "preset_text": "typeA"}))

    await service.handle_connection(ws, "/ws/character")

    assert json.loads(ws.sent[-1])["ok"] is True
    assert ws.closed is True
    assert not logger.errors


@pytest.mark.asyncio
async def test_character_session_reports_invalid_json():
    service = CharacterSessionService(
        safe_json_loads=lambda _text: None,
        generate_robot_stats=None,
        logger=DummyLogger(),
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket("not-json")

    await service.handle_connection(ws, "/ws/character")

    assert json.loads(ws.sent[-1])["error"] == "Invalid JSON format"
    assert ws.closed is True
