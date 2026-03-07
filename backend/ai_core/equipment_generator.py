from __future__ import annotations

from typing import Any, Literal, TypedDict

MountPointId = Literal["WEAPON_R", "WEAPON_L", "HEAD_ACCESSORY", "BACKPACK"]
CraftKind = Literal["skin", "attachment"]

VALID_MOUNT_POINTS: tuple[MountPointId, ...] = (
    "WEAPON_R",
    "WEAPON_L",
    "HEAD_ACCESSORY",
    "BACKPACK",
)


class EquipmentGenerationPayload(TypedDict):
    action: str
    mount_point: MountPointId | None
    scale: float
    inventory_type: str


def normalize_craft_kind(value: Any) -> CraftKind:
    if isinstance(value, str) and value.strip().lower() == "attachment":
        return "attachment"
    return "skin"


def normalize_mount_point(value: Any) -> MountPointId:
    if isinstance(value, str):
        upper = value.strip().upper()
        if upper in VALID_MOUNT_POINTS:
            return upper  # type: ignore[return-value]
    return "WEAPON_R"


def build_equipment_payload(craft_kind: CraftKind, mount_point: Any) -> EquipmentGenerationPayload:
    if craft_kind == "attachment":
        resolved_mount = normalize_mount_point(mount_point)
        return {
            "action": "attach",
            "mount_point": resolved_mount,
            "scale": 0.28,
            "inventory_type": "attachment",
        }

    return {
        "action": "equip",
        "mount_point": None,
        "scale": 1.0,
        "inventory_type": "skin",
    }
