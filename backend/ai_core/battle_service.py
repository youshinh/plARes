import math
import random
import time
from typing import Any, Callable

from .profile_service import normalize_material


class BattleService:
    def __init__(
        self,
        *,
        material_damage_multiplier: dict[str, dict[str, float]],
        ex_gauge_max: float,
        ex_gauge_on_hit: float,
        ex_gauge_on_critical: float,
        ex_gauge_on_hit_received: float,
        ex_gauge_per_second: float,
        room_runtime_state: dict[str, dict[str, Any]],
        room_user_map: dict[str, dict[str, Any]],
        ensure_runtime_state: Callable[[str], dict[str, Any]],
        room_user_lang: Callable[[str, str, str], str],
        special_phrase_for_lang: Callable[[str], str],
        broadcast_room: Callable[..., Any],
        record_room_event: Callable[[str, str, dict[str, Any]], None],
        finalize_room_runtime: Callable[..., Any],
        broadcast_winner_interview_and_bgm: Callable[[str, str, str, str], Any],
    ) -> None:
        self._material_damage_multiplier = material_damage_multiplier
        self._ex_gauge_max = ex_gauge_max
        self._ex_gauge_on_hit = ex_gauge_on_hit
        self._ex_gauge_on_critical = ex_gauge_on_critical
        self._ex_gauge_on_hit_received = ex_gauge_on_hit_received
        self._ex_gauge_per_second = ex_gauge_per_second
        self._room_runtime_state = room_runtime_state
        self._room_user_map = room_user_map
        self._ensure_runtime_state = ensure_runtime_state
        self._room_user_lang = room_user_lang
        self._special_phrase_for_lang = special_phrase_for_lang
        self._broadcast_room = broadcast_room
        self._record_room_event = record_room_event
        self._finalize_room_runtime = finalize_room_runtime
        self._broadcast_winner_interview_and_bgm = broadcast_winner_interview_and_bgm

    @staticmethod
    def calc_max_hp(vit: int) -> int:
        return 100 + max(1, int(vit)) * 2

    def calc_damage(
        self,
        attacker_power: int,
        attacker_material: str,
        defender_material: str,
        is_critical: bool,
    ) -> int:
        base = 10 + (max(1, int(attacker_power)) * 0.3)
        multiplier = self._material_damage_multiplier.get(normalize_material(attacker_material), {}).get(
            normalize_material(defender_material),
            1.0,
        )
        crit = 2.0 if is_critical else 1.0
        return max(1, int(math.floor(base * multiplier * crit)))

    @staticmethod
    def calc_down_chance(vit: int) -> float:
        return max(0.0, 0.5 - (max(1, int(vit)) / 200.0))

    @staticmethod
    def is_heat_activated(self_hp: int, max_hp: int, opponent_hp: int) -> bool:
        if max_hp <= 0:
            return False
        return (self_hp / max_hp) <= 0.2 and (opponent_hp - self_hp) > (max_hp * 0.3)

    def combatant_ids(self, room_id: str) -> list[str]:
        state = self._ensure_runtime_state(room_id)
        current_users = set(self._room_user_map.get(room_id, {}).keys())
        combatants: list[str] = []

        raw = state.get("combatants", [])
        if isinstance(raw, list):
            for uid in raw:
                sid = str(uid)
                if sid in current_users and sid not in combatants:
                    combatants.append(sid)
                if len(combatants) >= 2:
                    break

        if len(combatants) < 2:
            for uid in sorted(current_users):
                if uid not in combatants:
                    combatants.append(uid)
                if len(combatants) >= 2:
                    break

        state["combatants"] = combatants
        return combatants

    def ensure_user_battle_metrics(
        self,
        room_id: str,
        user_id: str,
        profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        state = self._ensure_runtime_state(room_id)
        metrics = state["per_user"][user_id]

        robot = profile.get("robot", {}) if isinstance(profile, dict) else {}
        if not isinstance(robot, dict):
            robot = {}
        stats = robot.get("stats", {})
        if not isinstance(stats, dict):
            stats = {}

        power = int(stats.get("power", metrics.get("power", 40)))
        vit = int(stats.get("vit", metrics.get("vit", 40)))
        material = normalize_material(robot.get("material", metrics.get("material", "Wood")))
        max_hp = self.calc_max_hp(vit)

        metrics["material"] = material
        metrics["power"] = max(1, power)
        metrics["vit"] = max(1, vit)
        metrics["max_hp"] = max_hp
        if "hp" not in metrics:
            metrics["hp"] = max_hp
        else:
            metrics["hp"] = max(0, min(int(metrics.get("hp", max_hp)), max_hp))

        metrics.setdefault("critical_hits", 0)
        metrics.setdefault("misses", 0)
        metrics.setdefault("ex_gauge", 0.0)
        metrics.setdefault("special_ready", False)
        metrics.setdefault("heat_active", False)
        metrics.setdefault("last_ex_tick", time.monotonic())
        return metrics

    def set_ex_gauge(self, metrics: dict[str, Any], value: float) -> tuple[bool, bool]:
        before = float(metrics.get("ex_gauge", 0.0))
        ready_before = bool(metrics.get("special_ready", False))
        bounded = max(0.0, min(self._ex_gauge_max, float(value)))
        metrics["ex_gauge"] = bounded
        ready_after = bounded >= (self._ex_gauge_max - 1e-6)
        metrics["special_ready"] = ready_after
        changed = int(before) != int(bounded) or ready_before != ready_after
        became_ready = (not ready_before) and ready_after
        return changed, became_ready

    def apply_ex_tick(self, metrics: dict[str, Any], now: float) -> tuple[bool, bool]:
        last = float(metrics.get("last_ex_tick", now))
        elapsed = max(0.0, now - last)
        metrics["last_ex_tick"] = now
        if elapsed <= 0.0:
            return False, False
        current = float(metrics.get("ex_gauge", 0.0))
        return self.set_ex_gauge(metrics, current + (elapsed * self._ex_gauge_per_second))

    def battle_status_payload(self, user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": user_id,
                "payload": {
                    "kind": "battle_status",
                    "hp": int(metrics.get("hp", 0)),
                    "max_hp": int(metrics.get("max_hp", 0)),
                    "ex_gauge": int(round(float(metrics.get("ex_gauge", 0.0)))),
                    "ex_max": int(self._ex_gauge_max),
                    "special_ready": bool(metrics.get("special_ready", False)),
                    "heat_active": bool(metrics.get("heat_active", False)),
                    "material": normalize_material(metrics.get("material", "Wood")),
                },
            },
        }

    def ex_gauge_payload(self, user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "buff_applied",
                "user": "server",
                "target": user_id,
                "payload": {
                    "kind": "ex_gauge_update",
                    "value": int(round(float(metrics.get("ex_gauge", 0.0)))),
                    "max": int(self._ex_gauge_max),
                    "special_ready": bool(metrics.get("special_ready", False)),
                    "hp": int(metrics.get("hp", 0)),
                    "max_hp": int(metrics.get("max_hp", 0)),
                    "heat_active": bool(metrics.get("heat_active", False)),
                },
            },
        }

    def special_ready_payload(self, room_id: str, user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
        lang = self._room_user_lang(room_id, user_id, default="en-US")
        return {
            "type": "event",
            "data": {
                "event": "special_ready",
                "user": "server",
                "target": user_id,
                "payload": {
                    "kind": "special_ready",
                    "text": self._special_phrase_for_lang(lang),
                    "ex_gauge": int(round(float(metrics.get("ex_gauge", 0.0)))),
                    "max": int(self._ex_gauge_max),
                },
            },
        }

    @staticmethod
    def heat_state_payload(user_id: str, metrics: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "heat_state",
                "user": "server",
                "target": user_id,
                "payload": {
                    "kind": "heat_state",
                    "active": bool(metrics.get("heat_active", False)),
                    "hp": int(metrics.get("hp", 0)),
                    "max_hp": int(metrics.get("max_hp", 0)),
                },
            },
        }

    @staticmethod
    def damage_applied_payload(
        *,
        attacker_id: str,
        defender_id: str,
        damage: int,
        defender_metrics: dict[str, Any],
        is_critical: bool,
    ) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "damage_applied",
                "user": "server",
                "payload": {
                    "kind": "damage_applied",
                    "attacker": attacker_id,
                    "target": defender_id,
                    "damage": int(damage),
                    "is_critical": bool(is_critical),
                    "hp_after": int(defender_metrics.get("hp", 0)),
                    "max_hp": int(defender_metrics.get("max_hp", 0)),
                    "material": normalize_material(defender_metrics.get("material", "Wood")),
                },
            },
        }

    @staticmethod
    def down_state_payload(defender_id: str, chance: float) -> dict[str, Any]:
        return {
            "type": "event",
            "data": {
                "event": "down_state",
                "user": "server",
                "payload": {
                    "kind": "down_state",
                    "target": defender_id,
                    "down": True,
                    "chance": round(chance, 3),
                },
            },
        }

    async def tick_room_ex_gauge(self, room_id: str) -> None:
        if room_id not in self._room_runtime_state:
            return
        now = time.monotonic()
        for user_id in self.combatant_ids(room_id):
            metrics = self.ensure_user_battle_metrics(room_id, user_id)
            changed, became_ready = self.apply_ex_tick(metrics, now)
            if changed:
                await self._broadcast_room(room_id, self.ex_gauge_payload(user_id, metrics), target_user=user_id)
            if became_ready:
                await self._broadcast_room(room_id, self.special_ready_payload(room_id, user_id, metrics), target_user=user_id)

    def consume_special_gauge(self, room_id: str, user_id: str) -> tuple[bool, dict[str, Any]]:
        metrics = self.ensure_user_battle_metrics(room_id, user_id)
        if not bool(metrics.get("special_ready", False)):
            return False, metrics
        metrics["last_ex_tick"] = time.monotonic()
        self.set_ex_gauge(metrics, 0.0)
        return True, metrics

    async def finish_match_by_hp(self, room_id: str, loser_id: str, reason: str = "hp_zero") -> None:
        if room_id not in self._room_runtime_state:
            return

        combatants = self.combatant_ids(room_id)
        if loser_id not in combatants:
            return
        winner_id = next((uid for uid in combatants if uid != loser_id), None)

        forced_results = {uid: ("LOSE" if uid == loser_id else "WIN") for uid in combatants}
        self._finalize_room_runtime(room_id, trigger=reason, forced_results=forced_results)
        await self._broadcast_room(
            room_id,
            {
                "type": "event",
                "data": {
                    "event": "match_end",
                    "user": "server",
                    "payload": {"kind": reason, "loser": loser_id, "winner": winner_id},
                },
            },
        )

        if not winner_id:
            return

        loser_lang = self._room_user_lang(room_id, loser_id, default="en-US")
        await self._broadcast_winner_interview_and_bgm(room_id, winner_id, loser_id, loser_lang)

    async def resolve_special_damage(self, room_id: str, attacker_id: str, is_critical: bool) -> None:
        if not is_critical:
            return

        combatants = self.combatant_ids(room_id)
        if attacker_id not in combatants:
            return
        defender_id = next((uid for uid in combatants if uid != attacker_id), None)
        if not defender_id:
            return

        attacker_metrics = self.ensure_user_battle_metrics(room_id, attacker_id)
        defender_metrics = self.ensure_user_battle_metrics(room_id, defender_id)

        damage = self.calc_damage(
            attacker_power=int(attacker_metrics.get("power", 40)),
            attacker_material=str(attacker_metrics.get("material", "Wood")),
            defender_material=str(defender_metrics.get("material", "Wood")),
            is_critical=is_critical,
        )
        defender_metrics["hp"] = max(0, int(defender_metrics.get("hp", 0)) - damage)

        attacker_delta = self._ex_gauge_on_critical if is_critical else self._ex_gauge_on_hit
        atk_changed, atk_ready = self.set_ex_gauge(
            attacker_metrics,
            float(attacker_metrics.get("ex_gauge", 0.0)) + attacker_delta,
        )
        def_changed, def_ready = self.set_ex_gauge(
            defender_metrics,
            float(defender_metrics.get("ex_gauge", 0.0)) + self._ex_gauge_on_hit_received,
        )

        if atk_changed:
            await self._broadcast_room(room_id, self.ex_gauge_payload(attacker_id, attacker_metrics), target_user=attacker_id)
        if atk_ready:
            await self._broadcast_room(room_id, self.special_ready_payload(room_id, attacker_id, attacker_metrics), target_user=attacker_id)
        if def_changed:
            await self._broadcast_room(room_id, self.ex_gauge_payload(defender_id, defender_metrics), target_user=defender_id)
        if def_ready:
            await self._broadcast_room(room_id, self.special_ready_payload(room_id, defender_id, defender_metrics), target_user=defender_id)

        damage_payload = self.damage_applied_payload(
            attacker_id=attacker_id,
            defender_id=defender_id,
            damage=damage,
            defender_metrics=defender_metrics,
            is_critical=is_critical,
        )
        await self._broadcast_room(room_id, damage_payload)
        self._record_room_event(room_id, attacker_id, damage_payload["data"])

        attacker_heat_before = bool(attacker_metrics.get("heat_active", False))
        defender_heat_before = bool(defender_metrics.get("heat_active", False))
        attacker_metrics["heat_active"] = self.is_heat_activated(
            int(attacker_metrics.get("hp", 0)),
            int(attacker_metrics.get("max_hp", 0)),
            int(defender_metrics.get("hp", 0)),
        )
        defender_metrics["heat_active"] = self.is_heat_activated(
            int(defender_metrics.get("hp", 0)),
            int(defender_metrics.get("max_hp", 0)),
            int(attacker_metrics.get("hp", 0)),
        )
        if attacker_heat_before != bool(attacker_metrics.get("heat_active", False)):
            await self._broadcast_room(room_id, self.heat_state_payload(attacker_id, attacker_metrics), target_user=attacker_id)
        if defender_heat_before != bool(defender_metrics.get("heat_active", False)):
            await self._broadcast_room(room_id, self.heat_state_payload(defender_id, defender_metrics), target_user=defender_id)

        chance = self.calc_down_chance(int(defender_metrics.get("vit", 40)))
        if random.random() < chance:
            down_payload = self.down_state_payload(defender_id, chance)
            await self._broadcast_room(room_id, down_payload)
            self._record_room_event(room_id, attacker_id, down_payload["data"])

        if int(defender_metrics.get("hp", 0)) <= 0:
            await self.finish_match_by_hp(room_id, defender_id)
