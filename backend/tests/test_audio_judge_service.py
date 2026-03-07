from ai_core.audio_judge import AudioJudgeService


class DummyLogger:
    def info(self, _message: str) -> None:
        pass

    def warning(self, _message: str) -> None:
        pass


class FakeClient:
    def __init__(self, text: str):
        self.text = text
        self.models = self

    def generate_content(self, **_kwargs):
        return type("Response", (), {"text": self.text})()


def build_service(client=None) -> AudioJudgeService:
    return AudioJudgeService(
        get_genai_client=lambda _api_version: client,
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


def test_judge_incantation_uses_recognized_phrase_similarity():
    service = build_service()

    close_match = service.judge_incantation(
        phrase="Burst Drive",
        expected_phrase="Burst Drive",
        recognized_phrase="Burst Drive",
        duration_ms=1100,
        spirit=0.8,
    )
    weak_match = service.judge_incantation(
        phrase="Burst Drive",
        expected_phrase="Burst Drive",
        recognized_phrase="Broken Diver",
        duration_ms=1100,
        spirit=0.8,
    )

    assert close_match["accuracy"] > weak_match["accuracy"]
    assert close_match["expected_phrase"] == "Burst Drive"


def test_build_audio_result_prefers_ai_scores_when_available():
    service = build_service(FakeClient('{"accuracy": 0.9, "passion": 1.0}'))

    result = service.build_audio_result(
        frame_count=8000,
        packet_count=12,
        elapsed_sec=1.0,
        avg_amplitude=0.05,
        peak_amplitude=0.1,
        sync_rate=0.5,
    )

    assert result["accuracy"] > 0.7
    assert result["passion"] > 0.8


def test_build_audio_result_prefers_transcript_similarity_when_available():
    service = build_service()

    close_match = service.build_audio_result(
        frame_count=8000,
        packet_count=12,
        elapsed_sec=1.0,
        avg_amplitude=0.05,
        peak_amplitude=0.1,
        sync_rate=0.5,
        expected_phrase="Burst Drive",
        recognized_phrase="Burst Drive",
    )
    weak_match = service.build_audio_result(
        frame_count=8000,
        packet_count=12,
        elapsed_sec=1.0,
        avg_amplitude=0.05,
        peak_amplitude=0.1,
        sync_rate=0.5,
        expected_phrase="Burst Drive",
        recognized_phrase="Broken Diver",
    )

    assert close_match["accuracy"] > weak_match["accuracy"]
    assert close_match["expected_phrase"] == "Burst Drive"
