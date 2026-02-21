import asyncio
import json
import os
import time
import uuid
from collections import defaultdict
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

import websockets
from websockets.exceptions import ConnectionClosed

try:
    from .streaming.bidi_session import handle_client_connection as adk_live_handler
except Exception as exc:  # pragma: no cover - import may fail in local envs
    adk_live_handler = None
    ADK_IMPORT_ERROR = str(exc)
else:
    ADK_IMPORT_ERROR = ""

HOST = os.getenv("PLARES_HOST", "0.0.0.0")
PORT = int(os.getenv("PLARES_PORT", "8000"))
GAME_PATH = "/ws/game"
AUDIO_PATH = "/ws/audio"
LIVE_PATH = "/ws/live"

game_clients: dict[Any, dict[str, str]] = {}
room_members: dict[str, set[Any]] = defaultdict(set)
room_user_map: dict[str, dict[str, Any]] = defaultdict(dict)


def _safe_json_loads(message: str) -> Optional[dict]:
    try:
        payload = json.loads(message)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None


def _parse_game_identity(request_path: str) -> tuple[str, str]:
    parsed = urlparse(request_path)
    query = parse_qs(parsed.query)
    user_id = query.get("user_id", [f"user_{uuid.uuid4().hex[:8]}"])[0]
    room_id = query.get("room_id", ["default"])[0]
    return user_id, room_id


def _cleanup_game_client(websocket: Any) -> None:
    meta = game_clients.pop(websocket, None)
    if not meta:
        return

    room_id = meta["room_id"]
    user_id = meta["user_id"]
    room_members[room_id].discard(websocket)
    current = room_user_map.get(room_id, {}).get(user_id)
    if current is websocket:
        del room_user_map[room_id][user_id]
    if not room_members[room_id]:
        room_members.pop(room_id, None)
        room_user_map.pop(room_id, None)


def _register_game_client(websocket: Any, user_id: str, room_id: str) -> None:
    existing = room_user_map.get(room_id, {}).get(user_id)
    if existing and existing is not websocket:
        _cleanup_game_client(existing)

    game_clients[websocket] = {"user_id": user_id, "room_id": room_id}
    room_members[room_id].add(websocket)
    room_user_map[room_id][user_id] = websocket


def _room_peer_ids(room_id: str) -> list[str]:
    return sorted(room_user_map.get(room_id, {}).keys())


def _roster_payload(room_id: str) -> dict:
    return {
        "type": "signal",
        "data": {
            "kind": "roster",
            "from": "server",
            "peers": _room_peer_ids(room_id),
        },
    }


async def _broadcast_roster(room_id: str) -> None:
    await _broadcast_room(room_id, _roster_payload(room_id))


async def _broadcast_room(
    room_id: str,
    payload: dict,
    exclude: Any | None = None,
    target_user: str | None = None,
) -> None:
    text = json.dumps(payload, ensure_ascii=False)
    stale: list[Any] = []

    if target_user:
        ws = room_user_map.get(room_id, {}).get(target_user)
        if ws and ws is not exclude:
            try:
                await ws.send(text)
            except ConnectionClosed:
                stale.append(ws)
    else:
        for ws in list(room_members.get(room_id, set())):
            if ws is exclude:
                continue
            try:
                await ws.send(text)
            except ConnectionClosed:
                stale.append(ws)

    for ws in stale:
        _cleanup_game_client(ws)


def _initial_tactics_payload() -> dict:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "payload": [
                {
                    "id": "tactics_cover",
                    "title": "障害物へ退避",
                    "detail": "敵の大技を待ってカウンター",
                    "action": "take_cover",
                    "target": {"x": 0.8, "y": 0.0, "z": -1.2},
                },
                {
                    "id": "tactics_flank",
                    "title": "右側面を取る",
                    "detail": "横移動で死角を作る",
                    "action": "flank_right",
                    "target": {"x": 1.5, "y": 0.0, "z": -1.6},
                },
            ],
        },
    }


def _score_pcm16_frame(chunk: bytes) -> tuple[float, float]:
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


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _build_audio_result(
    frame_count: int,
    packet_count: int,
    elapsed_sec: float,
    avg_amplitude: float,
    peak_amplitude: float,
) -> dict:
    elapsed = max(elapsed_sec, 0.001)
    duration_score = _clamp01(frame_count / (16000 * 1.3))
    packet_rate = packet_count / elapsed

    accuracy = _clamp01(0.45 + 0.55 * duration_score)
    speed = _clamp01(packet_rate / 8.0)
    passion = _clamp01((avg_amplitude * 1.2) + (peak_amplitude * 0.35))

    total = (accuracy * 0.45) + (speed * 0.2) + (passion * 0.35)
    verdict = "critical" if total >= 0.72 else "miss"
    return {
        "accuracy": round(accuracy, 3),
        "speed": round(speed, 3),
        "passion": round(passion, 3),
        "score": round(total, 3),
        "verdict": verdict,
        "is_critical": verdict == "critical",
        "is_miss": verdict != "critical",
        "action": "heavy_attack" if verdict == "critical" else "stumble",
    }


async def handle_game_connection(websocket: Any, request_path: str) -> None:
    user_id, room_id = _parse_game_identity(request_path)
    _register_game_client(websocket, user_id, room_id)
    print(
        f"[GAME] connected user={user_id} room={room_id} "
        f"room_clients={len(room_members.get(room_id, set()))}"
    )

    await websocket.send(json.dumps(_initial_tactics_payload(), ensure_ascii=False))
    await websocket.send(json.dumps(_roster_payload(room_id), ensure_ascii=False))
    await _broadcast_roster(room_id)

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                continue
            payload = _safe_json_loads(message)
            if not payload:
                continue

            packet_type = payload.get("type")
            if packet_type not in {"sync", "event", "signal"}:
                continue

            if packet_type == "signal":
                signal_data = payload.get("data")
                if not isinstance(signal_data, dict):
                    continue
                signal_data["from"] = user_id
                payload["data"] = signal_data
                target_user = signal_data.get("to") if isinstance(signal_data, dict) else None

                kind = signal_data.get("kind")
                if kind in {"offer", "answer", "ice"} and not target_user:
                    continue

                await _broadcast_room(room_id, payload, exclude=websocket, target_user=target_user)
            elif packet_type == "sync":
                sync_data = payload.get("data")
                if isinstance(sync_data, dict):
                    sync_data["userId"] = user_id
                    payload["data"] = sync_data
                await _broadcast_room(room_id, payload, exclude=websocket)
            elif packet_type == "event":
                event_data = payload.get("data")
                if isinstance(event_data, dict):
                    event_data["user"] = user_id
                    payload["data"] = event_data
                await _broadcast_room(room_id, payload, exclude=websocket)
            else:
                await _broadcast_room(room_id, payload, exclude=websocket)
    except ConnectionClosed:
        pass
    finally:
        _cleanup_game_client(websocket)
        await _broadcast_roster(room_id)
        print(
            f"[GAME] disconnected user={user_id} room={room_id} "
            f"room_clients={len(room_members.get(room_id, set()))}"
        )


async def handle_audio_connection(websocket: Any) -> None:
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
                payload = _safe_json_loads(message) or {}
                cmd = payload.get("cmd")
                if cmd == "open_audio_gate":
                    audio_gate_open = True
                    source = str(payload.get("source", "unknown"))
                    has_video_track = bool(payload.get("has_video_track", False))
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

            avg, peak = _score_pcm16_frame(message)
            packet_count += 1
            sample_count += len(message) // 2
            amplitude_sum += avg
            if peak > peak_amplitude:
                peak_amplitude = peak

            elapsed = time.monotonic() - start
            if packet_count >= 12 or elapsed >= 2.4:
                break
    except ConnectionClosed:
        return

    elapsed = time.monotonic() - start
    mean_amplitude = amplitude_sum / max(packet_count, 1)
    result = _build_audio_result(
        frame_count=sample_count,
        packet_count=packet_count,
        elapsed_sec=elapsed,
        avg_amplitude=mean_amplitude,
        peak_amplitude=peak_amplitude,
    )
    result["source"] = source
    result["has_video_track"] = has_video_track
    result["video_frame_count"] = video_frame_count
    result["last_video_ts"] = last_video_ts
    await websocket.send(json.dumps(result, ensure_ascii=False))


async def websocket_router(websocket: Any, path: Optional[str] = None) -> None:
    request_path = path or getattr(websocket, "path", "/")

    if request_path.startswith(GAME_PATH):
        await handle_game_connection(websocket, request_path)
        return

    if request_path.startswith(AUDIO_PATH):
        await handle_audio_connection(websocket)
        return

    if request_path.startswith(LIVE_PATH):
        if adk_live_handler is None:
            error = {
                "type": "error",
                "message": "ADK live handler unavailable",
                "detail": ADK_IMPORT_ERROR,
            }
            await websocket.send(json.dumps(error))
            return
        client_id = str(id(websocket))
        await adk_live_handler(client_id, websocket)
        return

    await websocket.send(json.dumps({"type": "error", "message": f"Unsupported path: {request_path}"}))


async def start_server() -> None:
    print("Starting PlaresAR Backend AI Core...")
    print(f"WebSocket server listening on ws://{HOST}:{PORT}")
    print(f"Routes: {GAME_PATH}, {AUDIO_PATH}, {LIVE_PATH}")
    async with websockets.serve(websocket_router, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(start_server())
