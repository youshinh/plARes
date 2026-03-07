from collections import defaultdict

from ai_core.adk_bridge import NullAdkBridge, RuntimeAdkBridge


def test_null_bridge_returns_unavailable_payload():
    bridge = NullAdkBridge()

    result = bridge.query_battle_state(room_id="room-1", user_id="u1")

    assert result["ok"] is False
    assert result["reason"] == "bridge_unavailable"


def test_runtime_bridge_returns_battle_snapshot():
    bridge = RuntimeAdkBridge(
        ensure_runtime_state=lambda _room_id: {
            "per_user": {
                "u1": {"hp": 180, "max_hp": 180, "ex_gauge": 50, "special_ready": False, "heat_active": False},
                "u2": {"hp": 120, "max_hp": 180},
            }
        },
        room_user_map=defaultdict(dict, {"room-1": {"u1": object(), "u2": object()}}),
        room_user_meta=defaultdict(dict, {"room-1": {"u1": {"sync_rate": 0.62}}}),
        clamp01=lambda value: max(0.0, min(1.0, float(value))),
    )

    result = bridge.query_battle_state(room_id="room-1", user_id="u1")

    assert result["ok"] is True
    assert result["opponent_id"] == "u2"
    assert result["hp"] == 180.0
    assert result["opponent_hp"] == 120.0
    assert result["sync_rate"] == 0.62


def test_runtime_bridge_sanitizes_unknown_tactic():
    bridge = RuntimeAdkBridge(
        ensure_runtime_state=lambda _room_id: {"per_user": {"u1": {"hp": 100, "max_hp": 100}}},
        room_user_map=defaultdict(dict, {"room-1": {"u1": object()}}),
        room_user_meta=defaultdict(dict),
        clamp01=lambda value: max(0.0, min(1.0, float(value))),
    )

    result = bridge.propose_tactic(room_id="room-1", user_id="u1", action="do something wild")

    assert result["ok"] is True
    assert result["action"] == "observe"
