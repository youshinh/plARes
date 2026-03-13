import asyncio
import json
import math
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable


class RuntimeService:
    def __init__(
        self,
        *,
        game_clients: dict[Any, dict[str, Any]],
        room_members: dict[str, set[Any]],
        room_user_map: dict[str, dict[str, Any]],
        room_user_meta: dict[str, dict[str, dict[str, Any]]],
        room_runtime_state: dict[str, dict[str, Any]],
        room_disconnect_tasks: dict[tuple[str, str], asyncio.Task[Any]],
        sync_max_speed_mps: float,
        sync_max_warp_distance: float,
        disconnect_detect_sec: float,
        reconnect_grace_sec: float,
        heartbeat_miss_sec: float,
        spectator_max_interventions: int,
        spectator_cooldown_sec: float,
        match_log_dir: Path,
        match_log_ttl_days: int,
        connection_closed_exception: type[Exception],
        logger: Any,
        interactions_api_version: str,
        interactions_model: str,
        user_profile_path: Callable[[str], Path],
        load_user_profile: Callable[[str, str, float], dict[str, Any]],
        save_user_profile: Callable[[dict[str, Any]], None],
        save_match_log_to_firestore: Callable[[str, dict[str, Any]], None],
        summarize_memory_summary: Callable[..., str],
        normalize_material: Callable[[Any], str],
        normalize_character_dna: Callable[..., dict[str, Any]],
        evolve_character_dna_by_matches: Callable[[dict[str, Any], int], dict[str, Any]],
        get_genai_client: Callable[[str], Any | None],
        normalize_model_name: Callable[[str, str], str],
        to_json_safe: Callable[[Any], Any],
        collect_text_fragments: Callable[[Any, list[str]], None],
        milestone_generator: Any | None,
    ) -> None:
        self._game_clients = game_clients
        self._room_members = room_members
        self._room_user_map = room_user_map
        self._room_user_meta = room_user_meta
        self._room_runtime_state = room_runtime_state
        self._room_disconnect_tasks = room_disconnect_tasks
        self._sync_max_speed_mps = sync_max_speed_mps
        self._sync_max_warp_distance = sync_max_warp_distance
        self._disconnect_detect_sec = disconnect_detect_sec
        self._reconnect_grace_sec = reconnect_grace_sec
        self._heartbeat_miss_sec = heartbeat_miss_sec
        self._spectator_max_interventions = spectator_max_interventions
        self._spectator_cooldown_sec = spectator_cooldown_sec
        self._match_log_dir = match_log_dir
        self._match_log_ttl_days = match_log_ttl_days
        self._connection_closed_exception = connection_closed_exception
        self._logger = logger
        self._interactions_api_version = interactions_api_version
        self._interactions_model = interactions_model
        self._user_profile_path = user_profile_path
        self._load_user_profile = load_user_profile
        self._save_user_profile = save_user_profile
        self._save_match_log_to_firestore = save_match_log_to_firestore
        self._summarize_memory_summary = summarize_memory_summary
        self._normalize_material = normalize_material
        self._normalize_character_dna = normalize_character_dna
        self._evolve_character_dna_by_matches = evolve_character_dna_by_matches
        self._get_genai_client = get_genai_client
        self._normalize_model_name = normalize_model_name
        self._to_json_safe = to_json_safe
        self._collect_text_fragments = collect_text_fragments
        self._milestone_generator = milestone_generator

    @staticmethod
    def _sanitize_id(value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "_", str(value))

    def ensure_runtime_state(self, room_id: str) -> dict[str, Any]:
        state = self._room_runtime_state.get(room_id)
        if state is not None:
            return state
        state = {
            "room_id": room_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "events": [],
            "sync_packets": 0,
            "spectator_interventions": 0,
            "spectator_cooldown_until": 0.0,
            "paused": False,
            "pause_reason": "",
            "combatants": [],
            "per_user": defaultdict(lambda: {"sync_packets": 0, "events": 0}),
        }
        self._room_runtime_state[room_id] = state
        return state

    def seed_runtime_state_from_room_meta(self, room_id: str) -> None:
        room_meta = self._room_user_meta.get(room_id, {})
        if not room_meta:
            return
        state = self.ensure_runtime_state(room_id)
        for user_id, meta in room_meta.items():
            user_state = state["per_user"][user_id]
            user_state["lang"] = str(meta.get("lang", "en-US"))
            try:
                sync_rate = float(meta.get("sync_rate", 0.5))
            except (TypeError, ValueError):
                sync_rate = 0.5
            user_state["sync_rate"] = max(0.0, min(1.0, sync_rate))
            user_state["last_heartbeat"] = time.monotonic()

    def mark_user_heartbeat(self, room_id: str, user_id: str) -> None:
        now = time.monotonic()
        state = self.ensure_runtime_state(room_id)
        state["per_user"][user_id]["last_heartbeat"] = now
        if user_id in self._room_user_meta.get(room_id, {}):
            self._room_user_meta[room_id][user_id]["last_heartbeat"] = now

    @staticmethod
    def _distance_xyz(a: dict[str, Any], b: dict[str, Any]) -> float:
        try:
            dx = float(a.get("x", 0.0)) - float(b.get("x", 0.0))
            dy = float(a.get("y", 0.0)) - float(b.get("y", 0.0))
            dz = float(a.get("z", 0.0)) - float(b.get("z", 0.0))
        except (TypeError, ValueError):
            return 0.0
        return math.sqrt((dx * dx) + (dy * dy) + (dz * dz))

    def validate_sync_packet(
        self,
        room_id: str,
        user_id: str,
        sync_data: dict[str, Any],
    ) -> tuple[bool, dict[str, Any] | None]:
        state = self.ensure_runtime_state(room_id)
        metrics = state["per_user"][user_id]
        current_pos = sync_data.get("position")
        if not isinstance(current_pos, dict):
            return False, {
                "kind": "state_correction",
                "message": "Invalid sync payload: position missing",
                "position": metrics.get("last_position", {"x": 0.0, "y": 0.0, "z": 0.0}),
            }

        now = time.monotonic()
        last_pos = metrics.get("last_position")
        last_server_recv = metrics.get("last_server_recv")
        if not isinstance(last_pos, dict) or not isinstance(last_server_recv, (int, float)):
            metrics["last_position"] = current_pos
            metrics["last_server_recv"] = now
            return True, None

        dt = max(0.001, now - float(last_server_recv))
        dist = self._distance_xyz(current_pos, last_pos)
        speed = dist / dt
        if dist > self._sync_max_warp_distance or speed > self._sync_max_speed_mps:
            return False, {
                "kind": "state_correction",
                "message": f"Sync corrected (dist={dist:.2f}m, speed={speed:.2f}m/s exceeds limit)",
                "reason": "movement_outlier",
                "position": last_pos,
                "stats": {
                    "distance": round(dist, 3),
                    "speed": round(speed, 3),
                    "max_speed": round(self._sync_max_speed_mps, 3),
                    "max_distance": round(self._sync_max_warp_distance, 3),
                },
            }

        metrics["last_position"] = current_pos
        metrics["last_server_recv"] = now
        return True, None

    def record_room_sync(self, room_id: str, user_id: str, sync_data: dict[str, Any]) -> None:
        state = self.ensure_runtime_state(room_id)
        state["sync_packets"] += 1
        state["per_user"][user_id]["sync_packets"] += 1
        state["per_user"][user_id]["last_action"] = sync_data.get("action")
        state["per_user"][user_id]["last_sync_ts"] = sync_data.get("timestamp")
        self.mark_user_heartbeat(room_id, user_id)

    def record_room_event(self, room_id: str, user_id: str, event_data: dict[str, Any]) -> None:
        state = self.ensure_runtime_state(room_id)
        state["per_user"][user_id]["events"] += 1
        self.mark_user_heartbeat(room_id, user_id)
        state["events"].append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": event_data.get("event", "unknown"),
                "user": user_id,
                "target": event_data.get("target"),
                "payload": event_data.get("payload"),
            }
        )
        if len(state["events"]) > 400:
            state["events"] = state["events"][-400:]

    @staticmethod
    def _build_highlights(events: list[dict[str, Any]]) -> list[dict[str, str]]:
        highlights: list[dict[str, str]] = []
        for event in events:
            name = str(event.get("event", ""))
            if name in {"critical_hit", "milestone_reached", "item_dropped"}:
                highlights.append(
                    {
                        "timestamp": str(event.get("timestamp", "")),
                        "description": f"{event.get('user')} triggered {name}",
                    }
                )
        return highlights[:32]

    def _generate_global_match_summary(
        self,
        events: list[dict[str, Any]],
        highlights: list[dict[str, str]],
    ) -> str:
        fallback = f"{len(events)} events captured in-memory, {len(highlights)} highlights extracted."
        client = self._get_genai_client(self._interactions_api_version)
        if client is None or not highlights:
            return fallback

        highlights_text = "\n".join(
            f"- {item.get('timestamp', '')}: {item.get('description', '')}" for item in highlights[:15]
        )
        prompt = (
            "You are an AI summarizing an AR robot battle match.\n"
            "Provide a short, thrilling 1-paragraph summary of the match based on these highlights:\n"
            f"{highlights_text}\n\n"
            "Output plain text only."
        )
        model = self._normalize_model_name(self._interactions_model, self._interactions_model)
        try:
            response = client.models.generate_content(model=model, contents=prompt)
            raw = self._to_json_safe(response)
            fragments: list[str] = []
            self._collect_text_fragments(raw, fragments)
            text = " ".join(dict.fromkeys(fragments)).strip()
            return text if text else fallback
        except Exception:
            return fallback

    def finalize_room_runtime(
        self,
        room_id: str,
        trigger: str = "room_empty",
        forced_results: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        state = self._room_runtime_state.pop(room_id, None)
        if not state:
            return []

        ended_at = datetime.now(timezone.utc).isoformat()
        events = state.get("events", [])
        highlights = self._build_highlights(events)
        per_user = {
            user_id: dict(metrics) for user_id, metrics in state.get("per_user", {}).items()
        }
        sync_packets = int(state.get("sync_packets", 0))
        if sync_packets <= 0 and len(events) == 0:
            self._logger.info(f"[MATCH] skipped empty commit room={room_id} trigger={trigger}")
            return []

        summary = {
            "room_id": room_id,
            "started_at": state.get("started_at"),
            "ended_at": ended_at,
            "total_events": len(events),
            "sync_packets": sync_packets,
            "highlights": highlights,
            "per_user": per_user,
            "memory_summary": self._generate_global_match_summary(events, highlights),
        }

        self._match_log_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        safe_room_id = self._sanitize_id(room_id)
        out_file = self._match_log_dir / f"{safe_room_id}_{stamp}.json"
        out_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

        memory_updates: list[dict[str, Any]] = []
        for user_id, metrics in per_user.items():
            lang = str(metrics.get("lang", "en-US"))
            try:
                sync_rate = float(metrics.get("sync_rate", 0.5))
            except (TypeError, ValueError):
                sync_rate = 0.5
            profile = self._load_user_profile(user_id, lang, sync_rate)

            critical_hits = int(metrics.get("critical_hits", 0))
            misses = int(metrics.get("misses", 0))
            forced = (forced_results or {}).get(user_id)
            if forced in {"WIN", "LOSE", "DRAW"}:
                result = forced
            elif critical_hits > misses:
                result = "WIN"
            elif critical_hits < misses:
                result = "LOSE"
            else:
                result = "DRAW"

            user_highlights = [
                item for item in highlights if item.get("description", "").startswith(f"{user_id} ")
            ]
            tone = str(
                metrics.get(
                    "tone",
                    profile.get("robot", {}).get("personality", {}).get("tone", "balanced"),
                )
            )
            audio_metrics = metrics.get("last_audio") if isinstance(metrics.get("last_audio"), dict) else {}
            audio_fragment = ""
            if audio_metrics:
                audio_fragment = (
                    f", audio(acc={audio_metrics.get('accuracy', 0)}, "
                    f"spd={audio_metrics.get('speed', 0)}, "
                    f"pas={audio_metrics.get('passion', 0)})"
                )
            memory_line = (
                f"{ended_at} {result}: critical={critical_hits}, miss={misses}, "
                f"room={room_id}, highlights={len(user_highlights)}{audio_fragment}"
            )

            profile["total_matches"] = int(profile.get("total_matches", 0)) + 1
            profile["lang"] = lang
            profile["ai_memory_summary"] = self._summarize_memory_summary(
                existing_summary=str(profile.get("ai_memory_summary", "")),
                memory_line=memory_line,
                user_highlights=user_highlights,
                lang=lang,
                tone=tone,
                sync_rate=sync_rate,
            )

            robot = profile.get("robot", {})
            personality = robot.get("personality", {})
            network = robot.get("network", {})
            material = self._normalize_material(robot.get("material", "Wood"))
            if "tone" in metrics:
                personality["tone"] = metrics["tone"]
            network["sync_rate"] = round(sync_rate, 3)
            robot["character_dna"] = self._evolve_character_dna_by_matches(
                self._normalize_character_dna(
                    robot.get("character_dna"),
                    material=material,
                    tone=str(personality.get("tone", "balanced")),
                ),
                int(profile["total_matches"]),
            )
            robot["personality"] = personality
            robot["network"] = network
            profile["robot"] = robot

            match_log = {
                "timestamp": ended_at,
                "room_id": room_id,
                "result": result,
                "critical_hits": critical_hits,
                "misses": misses,
                "highlight_events": user_highlights,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=self._match_log_ttl_days)).isoformat(),
            }
            logs = profile.get("match_logs", [])
            if not isinstance(logs, list):
                logs = []
            logs.append(match_log)
            profile["match_logs"] = logs[-25:]

            if profile["total_matches"] % 5 == 0:
                profile["pending_milestone"] = profile["total_matches"]

            self._save_user_profile(profile)
            self._save_match_log_to_firestore(user_id, match_log)

            if self._milestone_generator is not None:
                if result == "WIN":
                    asyncio.create_task(
                        self._milestone_generator.trigger_victory_music(
                            user_id,
                            str(profile.get("ai_memory_summary", "")),
                        )
                    )
                asyncio.create_task(
                    self._milestone_generator.check_and_generate_highlight_reel(
                        profile["total_matches"],
                        user_id,
                    )
                )

            user_log_dir = self._user_profile_path(user_id).parent / "match_logs"
            user_log_dir.mkdir(parents=True, exist_ok=True)
            user_log_file = user_log_dir / f"{safe_room_id}_{stamp}.json"
            user_log_file.write_text(json.dumps(match_log, ensure_ascii=False, indent=2), encoding="utf-8")
            memory_updates.append(
                {
                    "user_id": user_id,
                    "timestamp": ended_at,
                    "room_id": room_id,
                    "result": result,
                    "total_matches": profile["total_matches"],
                    "ai_memory_summary": profile["ai_memory_summary"],
                }
            )

        self._logger.info(f"[MATCH] committed runtime summary room={room_id} trigger={trigger} file={out_file}")
        return memory_updates

    def cancel_disconnect_task(self, room_id: str, user_id: str) -> None:
        key = (room_id, user_id)
        task = self._room_disconnect_tasks.pop(key, None)
        if task and not task.done():
            task.cancel()

    def consume_spectator_intervention(self, room_id: str) -> tuple[bool, str, float]:
        state = self.ensure_runtime_state(room_id)
        now = time.monotonic()
        cooldown_until = float(state.get("spectator_cooldown_until", 0.0))
        if now < cooldown_until:
            retry_after = max(0.0, cooldown_until - now)
            return False, f"Spectator cooldown active ({retry_after:.1f}s)", retry_after

        used = int(state.get("spectator_interventions", 0))
        if used >= self._spectator_max_interventions:
            return False, "Spectator interventions reached match cap", 0.0

        state["spectator_interventions"] = used + 1
        state["spectator_cooldown_until"] = now + self._spectator_cooldown_sec
        return True, "ok", 0.0

    def match_pause_payload(self, user_id: str, reason: str) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "match_paused",
                "user": "server",
                "payload": {
                    "kind": "match_pause",
                    "missing_user": user_id,
                    "reason": reason,
                    "message": f"Match paused: waiting for {user_id} reconnection",
                    "grace_sec": self._reconnect_grace_sec,
                },
            },
        }

    @staticmethod
    def match_resumed_payload(user_id: str) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "match_resumed",
                "user": "server",
                "payload": {
                    "kind": "match_resumed",
                    "user": user_id,
                    "message": f"{user_id} reconnected. Match resumed.",
                },
            },
        }

    def schedule_disconnect_resolution(self, room_id: str, user_id: str, reason: str) -> None:
        key = (room_id, user_id)
        existing = self._room_disconnect_tasks.get(key)
        if existing and not existing.done():
            return

        async def _runner() -> None:
            try:
                await asyncio.sleep(self._disconnect_detect_sec)
                if self._room_user_map.get(room_id, {}).get(user_id):
                    return

                state = self.ensure_runtime_state(room_id)
                state["paused"] = True
                state["pause_reason"] = reason
                await self.broadcast_room(room_id, self.match_pause_payload(user_id, reason))

                await asyncio.sleep(self._reconnect_grace_sec)
                if self._room_user_map.get(room_id, {}).get(user_id):
                    state["paused"] = False
                    state["pause_reason"] = ""
                    await self.broadcast_room(room_id, self.match_resumed_payload(user_id))
                    return

                state_combatants = self.ensure_runtime_state(room_id).get("combatants", [])
                users = [str(uid) for uid in state_combatants if isinstance(uid, str)]
                if user_id not in users:
                    users.append(user_id)
                if len(users) < 2:
                    for uid in self._room_user_meta.get(room_id, {}).keys():
                        sid = str(uid)
                        if sid not in users:
                            users.append(sid)
                        if len(users) >= 2:
                            break
                forced_results = {uid: ("LOSE" if uid == user_id else "WIN") for uid in users}
                disconnect_payload = {
                    "type": "event",
                    "data": {
                        "event": "disconnect_tko",
                        "user": "server",
                        "payload": {
                            "kind": "disconnect_tko",
                            "loser": user_id,
                            "reason": reason,
                        },
                    },
                }
                await self.broadcast_room(room_id, disconnect_payload)
                self.record_room_event(room_id, user_id, disconnect_payload["data"])
                self.finalize_room_runtime(
                    room_id,
                    trigger="disconnect_tko",
                    forced_results=forced_results,
                )
                self._room_user_meta.get(room_id, {}).pop(user_id, None)
                await self.broadcast_room(
                    room_id,
                    {
                        "type": "event",
                        "data": {
                            "event": "match_end",
                            "user": "server",
                            "payload": {"kind": "disconnect_tko", "loser": user_id},
                        },
                    },
                )
                await self.broadcast_roster(room_id)
            finally:
                self._room_disconnect_tasks.pop(key, None)

        self._room_disconnect_tasks[key] = asyncio.create_task(_runner())

    def cleanup_game_client(self, websocket: Any, reason: str = "connection_closed") -> bool:
        meta = self._game_clients.pop(websocket, None)
        if not meta:
            return False

        room_id = meta["room_id"]
        user_id = meta["user_id"]
        self._room_members[room_id].discard(websocket)
        current = self._room_user_map.get(room_id, {}).get(user_id)
        if current is websocket:
            del self._room_user_map[room_id][user_id]
        if not self._room_members[room_id]:
            self._room_members.pop(room_id, None)
            self._room_user_map.pop(room_id, None)
            self._room_user_meta.pop(room_id, None)
            for key in [item for item in self._room_disconnect_tasks.keys() if item[0] == room_id]:
                self.cancel_disconnect_task(key[0], key[1])
            self.finalize_room_runtime(room_id, trigger="room_empty")
            return True
        self.schedule_disconnect_resolution(room_id, user_id, reason=reason)
        return False

    def register_game_client(
        self,
        websocket: Any,
        user_id: str,
        room_id: str,
        lang: str,
        sync_rate: float,
    ) -> None:
        existing = self._room_user_map.get(room_id, {}).get(user_id)
        if existing and existing is not websocket:
            self.cleanup_game_client(existing, reason="replaced_connection")

        self._game_clients[websocket] = {
            "user_id": user_id,
            "room_id": room_id,
            "lang": lang,
            "sync_rate": sync_rate,
        }
        self._room_members[room_id].add(websocket)
        self._room_user_map[room_id][user_id] = websocket
        self._room_user_meta[room_id][user_id] = {
            "lang": lang,
            "sync_rate": sync_rate,
            "last_heartbeat": time.monotonic(),
        }
        self.cancel_disconnect_task(room_id, user_id)
        state = self.ensure_runtime_state(room_id)
        combatants = state.get("combatants")
        if not isinstance(combatants, list):
            combatants = []
        if user_id not in combatants and len(combatants) < 2:
            combatants.append(user_id)
        state["combatants"] = combatants
        state["per_user"][user_id]["lang"] = lang
        state["per_user"][user_id]["sync_rate"] = round(sync_rate, 3)
        state["per_user"][user_id]["last_heartbeat"] = time.monotonic()
        has_pending_for_room = any(key[0] == room_id for key in self._room_disconnect_tasks.keys())
        if state.get("paused") and not has_pending_for_room:
            state["paused"] = False
            state["pause_reason"] = ""
            asyncio.create_task(self.broadcast_room(room_id, self.match_resumed_payload(user_id)))

    def room_peer_ids(self, room_id: str) -> list[str]:
        return sorted(self._room_user_map.get(room_id, {}).keys())

    def roster_payload(self, room_id: str) -> dict[str, Any]:
        return {
            "type": "signal",
            "data": {
                "kind": "roster",
                "from": "server",
                "peers": self.room_peer_ids(room_id),
            },
        }

    async def broadcast_roster(self, room_id: str) -> None:
        await self.broadcast_room(room_id, self.roster_payload(room_id))

    async def broadcast_room(
        self,
        room_id: str,
        payload: dict[str, Any],
        exclude: Any | None = None,
        target_user: str | None = None,
    ) -> None:
        text = json.dumps(payload, ensure_ascii=False)
        stale: list[Any] = []

        if target_user:
            ws = self._room_user_map.get(room_id, {}).get(target_user)
            if ws and ws is not exclude:
                try:
                    await ws.send(text)
                except self._connection_closed_exception:
                    stale.append(ws)
        else:
            for ws in list(self._room_members.get(room_id, set())):
                if ws is exclude:
                    continue
                try:
                    await ws.send(text)
                except self._connection_closed_exception:
                    stale.append(ws)

        for ws in stale:
            self.cleanup_game_client(ws, reason="send_failed")

    async def heartbeat_watchdog(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            now = time.monotonic()
            stale_clients: list[Any] = []
            for room_id, users in list(self._room_user_meta.items()):
                for user_id, meta in list(users.items()):
                    ws = self._room_user_map.get(room_id, {}).get(user_id)
                    if ws is None:
                        continue
                    last = float(meta.get("last_heartbeat", 0.0))
                    if now - last <= self._heartbeat_miss_sec:
                        continue
                    key = (room_id, user_id)
                    if key in self._room_disconnect_tasks:
                        continue
                    stale_clients.append(ws)

            for ws in stale_clients:
                try:
                    await ws.close()
                except Exception:
                    pass
                self.cleanup_game_client(ws, reason="heartbeat_timeout")
