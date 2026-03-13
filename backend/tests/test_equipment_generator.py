from ai_core.equipment_generator import (
    build_equipment_payload,
    normalize_craft_kind,
    normalize_mount_point,
)


def test_normalize_craft_kind_defaults_to_skin():
    assert normalize_craft_kind(None) == "skin"
    assert normalize_craft_kind("skin") == "skin"


def test_normalize_craft_kind_accepts_attachment():
    assert normalize_craft_kind("attachment") == "attachment"


def test_normalize_mount_point_defaults_to_right_weapon():
    assert normalize_mount_point(None) == "WEAPON_R"
    assert normalize_mount_point("unknown") == "WEAPON_R"


def test_build_equipment_payload_for_attachment():
    payload = build_equipment_payload("attachment", "head_accessory")
    assert payload["action"] == "attach"
    assert payload["mount_point"] == "HEAD_ACCESSORY"
    assert payload["inventory_type"] == "attachment"


def test_build_equipment_payload_for_skin():
    payload = build_equipment_payload("skin", "BACKPACK")
    assert payload["action"] == "equip"
    assert payload["mount_point"] is None
    assert payload["inventory_type"] == "skin"
