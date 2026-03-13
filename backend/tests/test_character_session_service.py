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
    persisted = []

    async def generate_robot_stats(**kwargs):
        return {"ok": True, "received": kwargs}

    service = CharacterSessionService(
        safe_json_loads=lambda text: json.loads(text),
        generate_robot_stats=generate_robot_stats,
        persist_generated_profile=lambda user_id, result: persisted.append((user_id, result)),
        logger=logger,
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket(json.dumps({"user_id": "p1", "face_image_base64": "abc", "preset_text": "typeA"}))

    await service.handle_connection(ws, "/ws/character")

    assert json.loads(ws.sent[-1])["ok"] is True
    assert persisted == [("p1", {"ok": True, "received": {"face_image_base64": "abc", "preset_text": "typeA", "model_type": None}})]
    assert ws.closed is True
    assert not logger.errors


@pytest.mark.asyncio
async def test_character_session_reports_invalid_json():
    service = CharacterSessionService(
        safe_json_loads=lambda _text: None,
        generate_robot_stats=None,
        persist_generated_profile=None,
        logger=DummyLogger(),
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket("not-json")

    await service.handle_connection(ws, "/ws/character")

    assert json.loads(ws.sent[-1])["error"] == "Invalid JSON format"
    assert ws.closed is True


@pytest.mark.asyncio
async def test_character_session_skips_profile_persist_when_user_id_missing():
    persisted = []

    async def generate_robot_stats(**_kwargs):
        return {"name": "bot"}

    service = CharacterSessionService(
        safe_json_loads=lambda text: json.loads(text),
        generate_robot_stats=generate_robot_stats,
        persist_generated_profile=lambda user_id, result: persisted.append((user_id, result)),
        logger=DummyLogger(),
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket(json.dumps({"preset_text": "speed"}))

    await service.handle_connection(ws, "/ws/character")

    assert persisted == []


@pytest.mark.asyncio
async def test_character_session_responds_even_when_profile_persist_fails():
    logger = DummyLogger()

    async def generate_robot_stats(**_kwargs):
        return {"name": "bot"}

    service = CharacterSessionService(
        safe_json_loads=lambda text: json.loads(text),
        generate_robot_stats=generate_robot_stats,
        persist_generated_profile=lambda _user_id, _result: (_ for _ in ()).throw(RuntimeError("disk full")),
        logger=logger,
        connection_closed_exception=Exception,
    )
    ws = DummyWebSocket(json.dumps({"user_id": "p1"}))

    await service.handle_connection(ws, "/ws/character")

    assert json.loads(ws.sent[-1])["name"] == "bot"
    assert logger.errors
