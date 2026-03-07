import json
from difflib import SequenceMatcher
from typing import Any, Callable

from .utils import clamp01


class AudioJudgeService:
    def __init__(
        self,
        *,
        get_genai_client: Callable[[str], Any | None],
        normalize_model_name: Callable[[str, str], str],
        interactions_api_version: str,
        interactions_model: str,
        critical_threshold_base: float,
        sync_bonus_factor: float,
        sync_threshold_factor: float,
        logger: Any,
    ) -> None:
        self._get_genai_client = get_genai_client
        self._normalize_model_name = normalize_model_name
        self._interactions_api_version = interactions_api_version
        self._interactions_model = interactions_model
        self._critical_threshold_base = critical_threshold_base
        self._sync_bonus_factor = sync_bonus_factor
        self._sync_threshold_factor = sync_threshold_factor
        self._logger = logger

    @staticmethod
    def _phrase_similarity(expected_phrase: str, recognized_phrase: str) -> float:
        expected = " ".join(expected_phrase.strip().lower().split())
        recognized = " ".join(recognized_phrase.strip().lower().split())
        if not expected or not recognized:
            return 0.0
        return clamp01(SequenceMatcher(None, expected, recognized).ratio())

    @staticmethod
    def score_pcm16_frame(chunk: bytes) -> tuple[float, float]:
        sample_count = len(chunk) // 2
        if sample_count == 0:
            return 0.0, 0.0
        view = memoryview(chunk).cast("h")
        abs_sum = 0
        peak = 0
        for sample in view:
            amp = abs(int(sample))
            abs_sum += amp
            if amp > peak:
                peak = amp
        avg = abs_sum / sample_count / 32767.0
        peak_norm = peak / 32767.0
        return avg, peak_norm

    def build_audio_result(
        self,
        *,
        frame_count: int,
        packet_count: int,
        elapsed_sec: float,
        avg_amplitude: float,
        peak_amplitude: float,
        sync_rate: float,
        recognized_phrase: str | None = None,
        expected_phrase: str | None = None,
    ) -> dict[str, Any]:
        elapsed = max(elapsed_sec, 0.001)
        duration_score = clamp01(frame_count / (16000 * 1.3))
        packet_rate = packet_count / elapsed

        speed = clamp01(packet_rate / 8.0)
        pcm_passion = clamp01((avg_amplitude * 1.2) + (peak_amplitude * 0.35))
        transcript_similarity = (
            self._phrase_similarity(expected_phrase or "", recognized_phrase or "")
            if expected_phrase and recognized_phrase
            else None
        )

        client = self._get_genai_client(self._interactions_api_version)
        if client is None:
            fallback_accuracy = clamp01(0.45 + 0.55 * duration_score)
            if transcript_similarity is not None:
                accuracy = clamp01((fallback_accuracy * 0.25) + (transcript_similarity * 0.75))
            else:
                accuracy = fallback_accuracy
            passion = pcm_passion
        else:
            model = self._normalize_model_name(self._interactions_model, self._interactions_model)
            prompt = (
                "You are evaluating a player shouting a special move in an AR game.\n"
                + f"The player's vocal amplitude was measured at {pcm_passion:.2f}/1.0.\n"
                + (
                    f'The expected phrase was "{expected_phrase}" and a lightweight client transcript heard "{recognized_phrase}".\n'
                    if expected_phrase and recognized_phrase
                    else ""
                )
                + "Assess their passion and accuracy out of 1.0. Output valid JSON only, like:\n"
                + '{"accuracy": 0.8, "passion": 0.9}'
            )
            try:
                response = client.models.generate_content(model=model, contents=prompt)
                txt = response.text.strip()
                if txt.startswith("```json"):
                    txt = txt[7:]
                if txt.endswith("```"):
                    txt = txt[:-3]
                parsed = json.loads(txt.strip())
                ai_accuracy = float(parsed.get("accuracy", 0.7))
                ai_passion = float(parsed.get("passion", 0.7))
                if transcript_similarity is not None:
                    accuracy = clamp01(
                        (duration_score * 0.1)
                        + (ai_accuracy * 0.35)
                        + (transcript_similarity * 0.55)
                    )
                else:
                    accuracy = clamp01((duration_score * 0.2) + (ai_accuracy * 0.8))
                passion = clamp01((pcm_passion * 0.2) + (ai_passion * 0.8))
            except Exception as exc:
                self._logger.warning(
                    json.dumps({"event": "audio_eval_fallback", "error": str(exc)})
                )
                fallback_accuracy = clamp01(0.45 + 0.55 * duration_score)
                if transcript_similarity is not None:
                    accuracy = clamp01((fallback_accuracy * 0.25) + (transcript_similarity * 0.75))
                else:
                    accuracy = fallback_accuracy
                passion = pcm_passion

        base_total = (accuracy * 0.45) + (speed * 0.2) + (passion * 0.35)
        sync_bonus = (sync_rate - 0.5) * self._sync_bonus_factor
        total = clamp01(base_total + sync_bonus)
        critical_threshold = clamp01(
            self._critical_threshold_base - (sync_rate * self._sync_threshold_factor)
        )
        verdict = "critical" if total >= critical_threshold else "miss"

        result = {
            "accuracy": round(accuracy, 3),
            "speed": round(speed, 3),
            "passion": round(passion, 3),
            "sync_rate": round(sync_rate, 3),
            "recognized_phrase": (recognized_phrase or "").strip(),
            "expected_phrase": (expected_phrase or "").strip(),
            "critical_threshold": round(critical_threshold, 3),
            "score": round(total, 3),
            "verdict": verdict,
            "is_critical": verdict == "critical",
            "is_miss": verdict != "critical",
            "action": "heavy_attack" if verdict == "critical" else "stumble",
        }
        self._logger.info(
            json.dumps(
                {
                    "event": "voice_judge",
                    "result": verdict,
                    "score": round(total, 3),
                    "threshold": round(critical_threshold, 3),
                    "accuracy": round(accuracy, 3),
                    "speed": round(speed, 3),
                    "passion": round(passion, 3),
                    "sync_rate": round(sync_rate, 3),
                    "frame_count": frame_count,
                    "elapsed_sec": round(elapsed, 3),
                }
            )
        )
        return result

    def judge_incantation(
        self,
        *,
        phrase: str,
        recognized_phrase: str | None = None,
        expected_phrase: str | None = None,
        duration_ms: float | None = None,
        spirit: float | None = None,
    ) -> dict[str, Any]:
        clean_phrase = phrase.strip()
        phrase_len = len(clean_phrase)
        expected = (expected_phrase or clean_phrase).strip()
        recognized = (recognized_phrase or "").strip()
        if expected and recognized:
            similarity = self._phrase_similarity(expected, recognized)
            accuracy = clamp01(0.15 + (similarity * 0.85))
        else:
            accuracy = clamp01(0.35 + min(0.55, phrase_len / 24.0))
        if duration_ms is None:
            speed = 0.72
        else:
            speed = clamp01(1.0 - max(0.0, duration_ms - 900.0) / 2200.0)
        passion = clamp01(spirit if spirit is not None else 0.7)
        score = clamp01((accuracy * 0.45) + (speed * 0.2) + (passion * 0.35))
        verdict = "critical" if score >= 0.72 else "miss"
        sync_gain = round(0.12 * score, 3) if verdict == "critical" else round(0.03 * score, 3)
        return {
            "kind": "articulation_judge",
            "ok": True,
            "phrase": clean_phrase,
            "recognized_phrase": recognized,
            "expected_phrase": expected,
            "accuracy": round(accuracy, 3),
            "speed": round(speed, 3),
            "passion": round(passion, 3),
            "score": round(score, 3),
            "verdict": verdict,
            "sync_gain": sync_gain,
            "is_critical": verdict == "critical",
            "action": "heavy_attack" if verdict == "critical" else "stumble",
        }
