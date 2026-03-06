from collections import defaultdict

from ai_core.battle_service import BattleService


class Recorder:
    def __init__(self):
        self.calls = []

    async def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))


def build_service():
    runtime = {}
    room_user_map = defaultdict(dict, {"room-1": {"a": object(), "b": object()}})
    recorder = Recorder()
    events = []

    service = BattleService(
        material_damage_multiplier={
            "Wood": {"Wood": 1.0, "Metal": 0.8, "Resin": 1.3},
            "Metal": {"Wood": 1.3, "Metal": 1.0, "Resin": 0.8},
            "Resin": {"Wood": 0.8, "Metal": 1.3, "Resin": 1.0},
        },
        ex_gauge_max=100,
        ex_gauge_on_hit=8,
        ex_gauge_on_critical=16,
        ex_gauge_on_hit_received=12,
        ex_gauge_per_second=1,
        room_runtime_state=runtime,
        room_user_map=room_user_map,
        ensure_runtime_state=lambda room_id: runtime.setdefault(room_id, {"per_user": defaultdict(dict), "combatants": []}),
        room_user_lang=lambda _room_id, _user_id, default="en-US": default,
        special_phrase_for_lang=lambda _lang: "Ready",
        broadcast_room=recorder,
        record_room_event=lambda room_id, user_id, payload: events.append((room_id, user_id, payload)),
        finalize_room_runtime=lambda *_args, **_kwargs: None,
        broadcast_winner_interview_and_bgm=recorder,
    )
    return service, runtime


def test_calc_damage_uses_material_multiplier():
    service, _runtime = build_service()

    damage = service.calc_damage(
        attacker_power=50,
        attacker_material="Metal",
        defender_material="Wood",
        is_critical=True,
    )

    assert damage == 65


def test_consume_special_gauge_resets_ready_state():
    service, runtime = build_service()
    metrics = runtime.setdefault("room-1", {"per_user": defaultdict(dict), "combatants": []})["per_user"]["a"]
    metrics["special_ready"] = True
    metrics["ex_gauge"] = 100.0

    consumed, updated = service.consume_special_gauge("room-1", "a")

    assert consumed is True
    assert updated["special_ready"] is False
    assert updated["ex_gauge"] == 0.0
