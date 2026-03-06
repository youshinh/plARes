import time
from collections import defaultdict

from websockets.exceptions import ConnectionClosed

from ai_core.runtime_service import RuntimeService


class DummyLogger:
    def info(self, _message: str) -> None:
        pass


def build_runtime_service(tmp_path):
    return RuntimeService(
        game_clients={},
        room_members=defaultdict(set),
        room_user_map=defaultdict(dict),
        room_user_meta=defaultdict(dict),
        room_runtime_state={},
        room_disconnect_tasks={},
        sync_max_speed_mps=8.0,
        sync_max_warp_distance=1.2,
        disconnect_detect_sec=3.0,
        reconnect_grace_sec=15.0,
        heartbeat_miss_sec=3.0,
        spectator_max_interventions=3,
        spectator_cooldown_sec=30.0,
        match_log_dir=tmp_path / "match_logs",
        match_log_ttl_days=180,
        connection_closed_exception=ConnectionClosed,
        logger=DummyLogger(),
        interactions_api_version="v1alpha",
        interactions_model="gemini-3-flash-preview",
        user_profile_path=lambda user_id: tmp_path / user_id / "profile.json",
        load_user_profile=lambda user_id, lang, sync_rate: {
            "user_id": user_id,
            "lang": lang,
            "total_matches": 0,
            "ai_memory_summary": "",
            "robot": {
                "material": "Wood",
                "personality": {"tone": "balanced"},
                "network": {"sync_rate": sync_rate},
                "character_dna": {"version": "v1"},
            },
            "match_logs": [],
        },
        save_user_profile=lambda _profile: None,
        save_match_log_to_firestore=lambda _user_id, _match_log: None,
        summarize_memory_summary=lambda **kwargs: kwargs["memory_line"],
        normalize_material=lambda value: str(value or "Wood"),
        normalize_character_dna=lambda raw, **_kwargs: raw if isinstance(raw, dict) else {"version": "v1"},
        evolve_character_dna_by_matches=lambda dna, _total_matches: dna,
        get_genai_client=lambda _api_version: None,
        normalize_model_name=lambda model_name, _fallback: model_name,
        to_json_safe=lambda value: value,
        collect_text_fragments=lambda _value, _fragments: None,
        milestone_generator=None,
    )


def test_validate_sync_packet_rejects_outlier(tmp_path):
    service = build_runtime_service(tmp_path)
    state = service.ensure_runtime_state("room-1")
    metrics = state["per_user"]["u1"]
    metrics["last_position"] = {"x": 0.0, "y": 0.0, "z": 0.0}
    metrics["last_server_recv"] = time.monotonic() - 0.01

    ok, correction = service.validate_sync_packet(
        "room-1",
        "u1",
        {"position": {"x": 5.0, "y": 0.0, "z": 0.0}},
    )

    assert ok is False
    assert correction is not None
    assert correction["reason"] == "movement_outlier"


def test_register_game_client_updates_room_state_and_roster(tmp_path):
    service = build_runtime_service(tmp_path)
    ws1 = object()
    ws2 = object()

    service.register_game_client(ws1, "u2", "room-1", "ja-JP", 0.6)
    service.register_game_client(ws2, "u1", "room-1", "en-US", 0.4)

    assert service.room_peer_ids("room-1") == ["u1", "u2"]
    state = service.ensure_runtime_state("room-1")
    assert state["combatants"] == ["u2", "u1"]
    assert state["per_user"]["u2"]["lang"] == "ja-JP"
    assert state["per_user"]["u1"]["sync_rate"] == 0.4
