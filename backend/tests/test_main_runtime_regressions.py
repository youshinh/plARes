from collections import defaultdict

import pytest

from ai_core import main


def test_build_audio_result_fallback_without_genai(monkeypatch):
    monkeypatch.setattr(main, "_get_genai_client", lambda *_args, **_kwargs: None)

    result = main._build_audio_result(
        frame_count=16000,
        packet_count=16,
        elapsed_sec=2.0,
        avg_amplitude=0.35,
        peak_amplitude=0.7,
        sync_rate=0.6,
    )

    assert result["verdict"] in {"critical", "miss"}
    assert 0.0 <= result["accuracy"] <= 1.0
    assert 0.0 <= result["score"] <= 1.0


def test_voice_growth_feedback_uses_public_numeric_helpers():
    profile = {
        "training_logs": [
            {"accuracy": 0.2, "speed": 0.2, "passion": 0.2},
            {"accuracy": 0.25, "speed": 0.25, "passion": 0.25},
            {"accuracy": 0.85, "speed": 0.8, "passion": 0.9},
            {"accuracy": 0.9, "speed": 0.85, "passion": 0.95},
        ]
    }

    message = main._voice_growth_feedback(profile, "en-US")

    assert message == "Your voice was steadier today."


@pytest.mark.asyncio
async def test_generate_fusion_texture_accepts_base64_when_crafter_unavailable(monkeypatch):
    monkeypatch.setattr(main, "reality_crafter", None)

    url = await main._generate_fusion_texture(
        {
            "concept": "legendary hammer",
            "reference_image": "aGVsbG8=",
        }
    )

    assert url == "https://placehold.co/512x512/333/fff.png?text=Fallback"


@pytest.mark.asyncio
async def test_generate_winner_interview_uses_sync_rate_without_private_aliases(monkeypatch):
    room_id = "room-1"
    monkeypatch.setattr(main, "_get_genai_client", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        main,
        "room_user_meta",
        defaultdict(
            dict,
            {
                room_id: {
                    "winner": {"sync_rate": "0.8"},
                    "loser": {"sync_rate": "0.3"},
                }
            },
        ),
    )
    monkeypatch.setattr(main, "_room_user_lang", lambda *_args, **_kwargs: "en-US")
    monkeypatch.setattr(
        main,
        "_load_user_profile",
        lambda user_id, *_args, **_kwargs: {
            "robot": {
                "name": f"{user_id}-bot",
                "personality": {"tone": "balanced"},
            },
            "training_logs": [],
            "match_logs": [],
        },
    )

    text = await main._generate_winner_interview(room_id, "winner", "loser", "en-US")

    assert text == "winner-bot: Good match, loser."
