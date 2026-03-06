import json
from collections import defaultdict

import pytest

from ai_core.audio_session_service import AudioSessionService


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


class BroadcastRecorder:
    def __init__(self):
        self.calls = []

    async def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))


@pytest.mark.asyncio
async def test_audio_session_broadcasts_result_and_tone():
    broadcast = BroadcastRecorder()
    events = []
    specials = []
    room_members = defaultdict(set, {"room-1": {object()}})
    room_user_meta = defaultdict(dict, {"room-1": {"u1": {"lang": "ja-JP"}}})

    async def resolve_special_damage(**kwargs):
        specials.append(kwargs)

    service = AudioSessionService(
        parse_identity=lambda _path: ("u1", "room-1", "en-US", 0.6),
        safe_json_loads=lambda text: json.loads(text),
        clamp01=lambda value: max(0.0, min(1.0, float(value))),
        score_pcm16_frame=lambda _chunk: (0.4, 0.8),
        build_audio_result=lambda **_kwargs: {"verdict": "critical", "score": 0.9},
        room_members=room_members,
        room_user_meta=room_user_meta,
        broadcast_room=broadcast,
        record_room_event=lambda *args: events.append(args),
        update_persona_tone=lambda *_args: {
            "type": "event",
            "data": {"event": "buff_applied", "payload": {"kind": "persona_tone"}},
        },
        resolve_special_damage=resolve_special_damage,
        connection_closed_exception=Exception,
    )

    ws = AsyncIterWebSocket(
        [
            json.dumps({"cmd": "open_audio_gate", "source": "mic", "has_video_track": True}),
            b"\x00\x01\x02\x03",
        ]
    )

    await service.handle_connection(ws, "/ws/audio?user_id=u1&room_id=room-1")

    assert len(broadcast.calls) == 2
    payload = broadcast.calls[0][0][1]["data"]["payload"]
    assert payload["broadcasted"] is True
    assert payload["source"] == "mic"
    assert payload["has_video_track"] is True
    assert specials[-1]["attacker_id"] == "u1"
    assert json.loads(ws.sent[-1])["broadcasted"] is True
