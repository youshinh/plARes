from ai_core.audio_judge import AudioJudgeService


class DummyLogger:
    def info(self, _message: str) -> None:
        pass

    def warning(self, _message: str) -> None:
        pass


def build_service() -> AudioJudgeService:
    return AudioJudgeService(
        get_genai_client=lambda _api_version: None,
        normalize_model_name=lambda model, _fallback: model,
        interactions_api_version="v1alpha",
        interactions_model="gemini-3-flash-preview",
        critical_threshold_base=0.72,
        sync_bonus_factor=0.16,
        sync_threshold_factor=0.08,
        logger=DummyLogger(),
    )


def test_score_pcm16_frame_handles_empty_chunk():
    service = build_service()
    assert service.score_pcm16_frame(b"") == (0.0, 0.0)


def test_judge_incantation_returns_expected_shape():
    service = build_service()
    result = service.judge_incantation(phrase="Burst Drive", duration_ms=1100, spirit=0.8)

    assert result["ok"] is True
    assert result["phrase"] == "Burst Drive"
    assert result["verdict"] in {"critical", "miss"}
    assert 0.0 <= result["sync_gain"] <= 0.12
