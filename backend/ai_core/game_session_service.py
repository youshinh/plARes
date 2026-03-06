import asyncio
import json
from typing import Any, Callable


class GameSessionService:
    def __init__(
        self,
        *,
        parse_identity: Callable[[str], tuple[str, str, str, float]],
        register_game_client: Callable[[Any, str, str, str, float], None],
        load_user_profile: Callable[[str, str, float], dict[str, Any]],
        save_user_profile: Callable[[dict[str, Any]], None],
        ensure_user_battle_metrics: Callable[[str, str, dict[str, Any] | None], dict[str, Any]],
        vertex_cache_instance: Any | None,
        room_members: dict[str, set[Any]],
        logger: Any,
        profile_sync_payload: Callable[[str, dict[str, Any]], dict[str, Any]],
        milestone_payload: Callable[[str, int], dict[str, Any]],
        initial_tactics_payload: Callable[[str], dict[str, Any]],
        battle_status_payload: Callable[[str, dict[str, Any]], dict[str, Any]],
        roster_payload: Callable[[str], dict[str, Any]],
        broadcast_roster: Callable[[str], Any],
        cleanup_game_client: Callable[[Any], bool],
        safe_json_loads: Callable[[str], dict[str, Any] | None],
        game_application: Any,
        session_context_factory: Callable[..., Any],
        connection_closed_exception: type[Exception],
    ) -> None:
        self._parse_identity = parse_identity
        self._register_game_client = register_game_client
        self._load_user_profile = load_user_profile
        self._save_user_profile = save_user_profile
        self._ensure_user_battle_metrics = ensure_user_battle_metrics
        self._vertex_cache_instance = vertex_cache_instance
        self._room_members = room_members
        self._logger = logger
        self._profile_sync_payload = profile_sync_payload
        self._milestone_payload = milestone_payload
        self._initial_tactics_payload = initial_tactics_payload
        self._battle_status_payload = battle_status_payload
        self._roster_payload = roster_payload
        self._broadcast_roster = broadcast_roster
        self._cleanup_game_client = cleanup_game_client
        self._safe_json_loads = safe_json_loads
        self._game_application = game_application
        self._session_context_factory = session_context_factory
        self._connection_closed_exception = connection_closed_exception

    async def _init_vertex_cache(
        self,
        user_id: str,
        lang: str,
        profile: dict[str, Any],
    ) -> None:
        if self._vertex_cache_instance is None:
            return
        sys_inst = (
            f"You are evaluating game tactics. Player {user_id} speaks {lang}. "
            f"Tone: {profile.get('robot', {}).get('personality', {}).get('tone', 'balanced')}, "
            f"Sync: {profile.get('robot', {}).get('network', {}).get('sync_rate', 0.5)}"
        )
        contents = [
            f"Memory Summary: {profile.get('ai_memory_summary', 'None')}",
            json.dumps(profile.get("match_logs", []), ensure_ascii=False),
        ]
        await self._vertex_cache_instance.load_historical_context(user_id, sys_inst, contents)

    async def handle_connection(self, websocket: Any, request_path: str) -> None:
        user_id, room_id, lang, sync_rate = self._parse_identity(request_path)
        self._register_game_client(websocket, user_id, room_id, lang, sync_rate)
        profile = self._load_user_profile(user_id, lang, sync_rate)
        self._save_user_profile(profile)
        battle_metrics = self._ensure_user_battle_metrics(room_id, user_id, profile)

        if self._vertex_cache_instance is not None:
            asyncio.create_task(self._init_vertex_cache(user_id, lang, profile))
        self._logger.info(
            f"[GAME] connected user={user_id} room={room_id} lang={lang} sync_rate={sync_rate:.2f} "
            f"room_clients={len(self._room_members.get(room_id, set()))}"
        )

        try:
            await websocket.send(json.dumps(self._profile_sync_payload(user_id, profile), ensure_ascii=False))
            pending_milestone = int(profile.get("pending_milestone", 0))
            if pending_milestone > 0:
                await websocket.send(
                    json.dumps(self._milestone_payload(user_id, pending_milestone), ensure_ascii=False)
                )
                profile["pending_milestone"] = 0
                self._save_user_profile(profile)

            await websocket.send(json.dumps(self._initial_tactics_payload(lang), ensure_ascii=False))
            await websocket.send(
                json.dumps(self._battle_status_payload(user_id, battle_metrics), ensure_ascii=False)
            )
            await websocket.send(json.dumps(self._roster_payload(room_id), ensure_ascii=False))
            await self._broadcast_roster(room_id)
        except self._connection_closed_exception:
            self._cleanup_game_client(websocket)
            await self._broadcast_roster(room_id)
            self._logger.info(
                f"[GAME] disconnected user={user_id} room={room_id} "
                f"room_clients={len(self._room_members.get(room_id, set()))}"
            )
            return

        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    continue
                payload = self._safe_json_loads(message)
                if not payload:
                    continue
                await self._game_application.process_packet(
                    payload,
                    self._session_context_factory(
                        websocket=websocket,
                        user_id=user_id,
                        room_id=room_id,
                        lang=lang,
                        sync_rate=sync_rate,
                    ),
                )
        except self._connection_closed_exception:
            pass
        finally:
            self._cleanup_game_client(websocket)
            await self._broadcast_roster(room_id)
            self._logger.info(
                f"[GAME] disconnected user={user_id} room={room_id} "
                f"room_clients={len(self._room_members.get(room_id, set()))}"
            )
