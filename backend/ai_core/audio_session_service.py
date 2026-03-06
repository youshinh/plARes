import json
import time
from typing import Any, Callable


class AudioSessionService:
    def __init__(
        self,
        *,
        parse_identity: Callable[[str], tuple[str, str, str, float]],
        safe_json_loads: Callable[[str], dict[str, Any] | None],
        clamp01: Callable[[float], float],
        score_pcm16_frame: Callable[[bytes], tuple[float, float]],
        build_audio_result: Callable[..., dict[str, Any]],
        room_members: dict[str, set[Any]],
        room_user_meta: dict[str, dict[str, dict[str, Any]]],
        broadcast_room: Callable[..., Any],
        record_room_event: Callable[[str, str, dict[str, Any]], None],
        update_persona_tone: Callable[..., dict[str, Any] | None],
        resolve_special_damage: Callable[..., Any],
        connection_closed_exception: type[Exception],
    ) -> None:
        self._parse_identity = parse_identity
        self._safe_json_loads = safe_json_loads
        self._clamp01 = clamp01
        self._score_pcm16_frame = score_pcm16_frame
        self._build_audio_result = build_audio_result
        self._room_members = room_members
        self._room_user_meta = room_user_meta
        self._broadcast_room = broadcast_room
        self._record_room_event = record_room_event
        self._update_persona_tone = update_persona_tone
        self._resolve_special_damage = resolve_special_damage
        self._connection_closed_exception = connection_closed_exception

    async def handle_connection(self, websocket: Any, request_path: str) -> None:
        user_id, room_id, lang, sync_rate = self._parse_identity(request_path)
        audio_gate_open = False
        source = "unknown"
        has_video_track = False
        video_frame_count = 0
        last_video_ts = 0
        sample_count = 0
        packet_count = 0
        amplitude_sum = 0.0
        peak_amplitude = 0.0
        start = time.monotonic()

        try:
            async for message in websocket:
                if isinstance(message, str):
                    payload = self._safe_json_loads(message) or {}
                    cmd = payload.get("cmd")
                    if cmd == "open_audio_gate":
                        audio_gate_open = True
                        source = str(payload.get("source", "unknown"))
                        has_video_track = bool(payload.get("has_video_track", False))
                        lang = str(payload.get("lang", lang or "en-US"))
                        user_id = str(payload.get("user_id", user_id))
                        room_id = str(payload.get("room_id", room_id))
                        try:
                            sync_rate = self._clamp01(float(payload.get("sync_rate", sync_rate)))
                        except (TypeError, ValueError):
                            sync_rate = self._clamp01(sync_rate)
                        start = time.monotonic()
                    elif cmd == "video_frame":
                        video_frame_count += 1
                        ts = payload.get("ts", 0)
                        if isinstance(ts, (int, float)):
                            last_video_ts = int(ts)
                    elif cmd == "close_audio_gate":
                        break
                    continue

                if not audio_gate_open:
                    continue

                avg, peak = self._score_pcm16_frame(message)
                packet_count += 1
                sample_count += len(message) // 2
                amplitude_sum += avg
                if peak > peak_amplitude:
                    peak_amplitude = peak

                elapsed = time.monotonic() - start
                if packet_count >= 12 or elapsed >= 2.4:
                    break
        except self._connection_closed_exception:
            return

        elapsed = time.monotonic() - start
        mean_amplitude = amplitude_sum / max(packet_count, 1)
        result = self._build_audio_result(
            frame_count=sample_count,
            packet_count=packet_count,
            elapsed_sec=elapsed,
            avg_amplitude=mean_amplitude,
            peak_amplitude=peak_amplitude,
            sync_rate=sync_rate,
        )
        battle_event = "critical_hit" if result["verdict"] == "critical" else "debuff_applied"
        result["source"] = source
        result["lang"] = lang
        result["room_id"] = room_id
        result["user_id"] = user_id
        result["has_video_track"] = has_video_track
        result["video_frame_count"] = video_frame_count
        result["last_video_ts"] = last_video_ts
        result["broadcasted"] = False

        if room_id in self._room_members and user_id:
            user_lang = str(self._room_user_meta.get(room_id, {}).get(user_id, {}).get("lang", lang))
            payload = {
                "type": "event",
                "data": {
                    "event": battle_event,
                    "user": user_id,
                    "payload": result,
                },
            }
            await self._broadcast_room(room_id, payload)
            self._record_room_event(room_id, user_id, payload["data"])
            result["broadcasted"] = True

            tone_payload = self._update_persona_tone(room_id, user_id, result["verdict"], user_lang)
            if tone_payload:
                await self._broadcast_room(room_id, tone_payload, target_user=user_id)
                self._record_room_event(room_id, user_id, tone_payload["data"])
            await self._resolve_special_damage(
                room_id=room_id,
                attacker_id=user_id,
                is_critical=bool(result.get("verdict") == "critical"),
            )

        await websocket.send(json.dumps(result, ensure_ascii=False))
