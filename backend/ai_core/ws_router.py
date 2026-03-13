import asyncio
import json
import uuid
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import parse_qs, urlparse


def query_from_path(request_path: str) -> dict[str, list[str]]:
    parsed = urlparse(request_path)
    return parse_qs(parsed.query)


def parse_lang(query: dict[str, list[str]]) -> str:
    raw = str(query.get("lang", ["en-US"])[0]).strip()
    return raw if raw else "en-US"


def parse_sync_rate(
    query: dict[str, list[str]],
    clamp01: Callable[[float], float],
    default: float = 0.5,
) -> float:
    raw = query.get("sync_rate", [str(default)])[0]
    try:
        return clamp01(float(raw))
    except (TypeError, ValueError):
        return default


def parse_game_identity(
    request_path: str,
    clamp01: Callable[[float], float],
) -> tuple[str, str, str, float]:
    query = query_from_path(request_path)
    user_id = query.get("user_id", [f"user_{uuid.uuid4().hex[:8]}"])[0]
    room_id = query.get("room_id", ["default"])[0]
    lang = parse_lang(query)
    sync_rate = parse_sync_rate(query, clamp01, default=0.5)
    return user_id, room_id, lang, sync_rate


def parse_audio_identity(
    request_path: str,
    clamp01: Callable[[float], float],
) -> tuple[str, str, str, float]:
    query = query_from_path(request_path)
    user_id = query.get("user_id", [f"audio_{uuid.uuid4().hex[:8]}"])[0]
    room_id = query.get("room_id", ["default"])[0]
    lang = parse_lang(query)
    sync_rate = parse_sync_rate(query, clamp01, default=0.5)
    return user_id, room_id, lang, sync_rate


def resolve_request_path(websocket: Any, path: Optional[str] = None) -> str:
    request_path = path or getattr(websocket, "path", None)
    if not request_path:
        request_obj = getattr(websocket, "request", None)
        request_path = getattr(request_obj, "path", "/")
    if not isinstance(request_path, str) or not request_path:
        return "/"
    return request_path


async def route_websocket_connection(
    websocket: Any,
    *,
    path: Optional[str],
    character_path: str,
    game_path: str,
    audio_path: str,
    live_path: str,
    character_handler: Callable[[Any, str], Awaitable[None]],
    game_handler: Callable[[Any, str], Awaitable[None]],
    audio_handler: Callable[[Any, str], Awaitable[None]],
    live_handler: Callable[[str, Any], Awaitable[None]] | None,
    live_import_error: str,
) -> None:
    request_path = resolve_request_path(websocket, path)

    if request_path.startswith(character_path):
        await character_handler(websocket, request_path)
        return

    if request_path.startswith(game_path):
        await game_handler(websocket, request_path)
        return

    if request_path.startswith(audio_path):
        await audio_handler(websocket, request_path)
        return

    if request_path.startswith(live_path):
        if live_handler is None:
            await websocket.send(
                json.dumps(
                    {
                        "type": "error",
                        "message": "ADK live handler unavailable",
                        "detail": live_import_error,
                    }
                )
            )
            return
        client_id = str(id(websocket))
        await live_handler(client_id, websocket)
        return

    await websocket.send(json.dumps({"type": "error", "message": f"Unsupported path: {request_path}"}))


async def serve_forever(
    *,
    host: str,
    port: int,
    websocket_router: Callable[[Any, Optional[str]], Awaitable[None]],
    heartbeat_watchdog: Callable[[], Awaitable[None]],
    websockets_module: Any,
    logger: Any,
    route_summary: str,
) -> None:
    logger.info("Starting PlaresAR Backend AI Core...")
    logger.info(f"WebSocket server listening on ws://{host}:{port}")
    logger.info(f"Routes: {route_summary}")
    watchdog_task = asyncio.create_task(heartbeat_watchdog())
    try:
        async with websockets_module.serve(websocket_router, host, port):
            await asyncio.Future()
    finally:
        watchdog_task.cancel()
