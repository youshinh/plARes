import pytest

from ai_core.dialogue_service import DialogueService


class BroadcastRecorder:
    def __init__(self):
        self.calls = []

    async def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))


class DummyLogger:
    def info(self, _message: str) -> None:
        pass

    def warning(self, _message: str) -> None:
        pass


def build_service():
    broadcast = BroadcastRecorder()
    service = DialogueService(
        room_user_meta={"room-1": {"u1": {"sync_rate": 0.5}, "u2": {"sync_rate": 0.4}}},
        room_user_lang=lambda _room_id, _user_id, default="en-US": default,
        load_user_profile=lambda user_id, *_args: {
            "robot": {"name": f"{user_id}-bot", "personality": {"tone": "balanced"}},
            "training_logs": [],
            "match_logs": [],
            "ai_memory_summary": "",
        },
        get_genai_client=lambda *_args: None,
        interactions_api_version="v1alpha",
        interactions_model="gemini-3-flash-preview",
        normalize_model_name=lambda model, _fallback: model,
        to_json_safe=lambda value: value,
        collect_text_fragments=lambda _value, _fragments: None,
        proactive_line_max_chars=15,
        logger=DummyLogger(),
        milestone_generator=None,
        bgm_ready_delay_sec=0.0,
        broadcast_room=broadcast,
        lang_bucket=lambda lang: "ja" if lang.startswith("ja") else "en",
    )
    return service, broadcast


@pytest.mark.asyncio
async def test_generate_proactive_line_uses_trimmed_fallback_without_genai():
    service, _broadcast = build_service()

    text = await service.generate_proactive_line(
        user_id="u1",
        room_id="room-1",
        trigger="darkness",
        context="lights are dim",
    )

    assert text == "Night falls."


@pytest.mark.asyncio
async def test_broadcast_winner_interview_and_bgm_sends_interview_payload():
    service, broadcast = build_service()

    await service.broadcast_winner_interview_and_bgm("room-1", "u1", "u2", "en-US")

    payload = broadcast.calls[0][0][1]["data"]
    assert payload["event"] == "winner_interview"
    assert payload["payload"]["winner"] == "u1"
