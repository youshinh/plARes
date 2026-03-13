from dataclasses import dataclass
from typing import Any, Protocol, Callable


class AdkBridge(Protocol):
    def query_battle_state(self, *, room_id: str, user_id: str) -> dict[str, Any]:
        ...

    def propose_tactic(
        self,
        *,
        room_id: str,
        user_id: str,
        action: str,
        target: str | None = None,
    ) -> dict[str, Any]:
        ...


@dataclass
class NullAdkBridge:
    def query_battle_state(self, *, room_id: str, user_id: str) -> dict[str, Any]:
        return {
            "ok": False,
            "kind": "battle_state_snapshot",
            "room_id": room_id,
            "user_id": user_id,
            "reason": "bridge_unavailable",
        }

    def propose_tactic(
        self,
        *,
        room_id: str,
        user_id: str,
        action: str,
        target: str | None = None,
    ) -> dict[str, Any]:
        return {
            "ok": False,
            "kind": "tactical_recommendation",
            "room_id": room_id,
            "user_id": user_id,
            "action": action,
            "target": target,
            "reason": "bridge_unavailable",
        }


class RuntimeAdkBridge:
    _allowed_actions = {
        "attack",
        "heavy_attack",
        "evade",
        "take_cover",
        "flank_left",
        "flank_right",
        "observe",
        "hold",
        "charge",
    }

    def __init__(
        self,
        *,
        ensure_runtime_state: Callable[[str], dict[str, Any]],
        room_user_map: dict[str, dict[str, Any]],
        room_user_meta: dict[str, dict[str, dict[str, Any]]],
        clamp01: Callable[[float], float],
    ) -> None:
        self._ensure_runtime_state = ensure_runtime_state
        self._room_user_map = room_user_map
        self._room_user_meta = room_user_meta
        self._clamp01 = clamp01

    def query_battle_state(self, *, room_id: str, user_id: str) -> dict[str, Any]:
        runtime = self._ensure_runtime_state(room_id)
        per_user = runtime.get("per_user", {})
        metrics = per_user.get(user_id, {}) if isinstance(per_user, dict) else {}
        opponent_id = next(
            (candidate for candidate in self._room_user_map.get(room_id, {}) if candidate != user_id),
            None,
        )
        opponent_metrics = per_user.get(opponent_id, {}) if opponent_id and isinstance(per_user, dict) else {}
        sync_rate = self._clamp01(
            float(self._room_user_meta.get(room_id, {}).get(user_id, {}).get("sync_rate", 0.5))
        )
        return {
            "ok": True,
            "kind": "battle_state_snapshot",
            "room_id": room_id,
            "user_id": user_id,
            "opponent_id": opponent_id,
            "hp": float(metrics.get("hp", 0.0)),
            "max_hp": float(metrics.get("max_hp", 0.0)),
            "ex_gauge": float(metrics.get("ex_gauge", 0.0)),
            "special_ready": bool(metrics.get("special_ready", False)),
            "heat_active": bool(metrics.get("heat_active", False)),
            "sync_rate": round(sync_rate, 3),
            "opponent_hp": float(opponent_metrics.get("hp", 0.0)),
            "opponent_max_hp": float(opponent_metrics.get("max_hp", 0.0)),
        }

    def propose_tactic(
        self,
        *,
        room_id: str,
        user_id: str,
        action: str,
        target: str | None = None,
    ) -> dict[str, Any]:
        normalized = (action or "").strip().lower().replace(" ", "_")
        if normalized not in self._allowed_actions:
            normalized = "observe"
        snapshot = self.query_battle_state(room_id=room_id, user_id=user_id)
        return {
            "ok": True,
            "kind": "tactical_recommendation",
            "room_id": room_id,
            "user_id": user_id,
            "target": target,
            "action": normalized,
            "battle_state": snapshot,
        }


_bridge: AdkBridge = NullAdkBridge()


def set_adk_bridge(bridge: AdkBridge | None) -> None:
    global _bridge
    _bridge = bridge or NullAdkBridge()


def get_adk_bridge() -> AdkBridge:
    return _bridge
