from ai_core.message_contracts import validate_inbound_packet


def test_validate_inbound_packet_accepts_valid_sync():
    payload = {
        "type": "sync",
        "data": {
            "position": {"x": 0.0, "y": 1.0, "z": 2.0},
        },
    }

    assert validate_inbound_packet(payload) == payload


def test_validate_inbound_packet_rejects_bad_sync_position():
    payload = {
        "type": "sync",
        "data": {
            "position": {"x": "0", "y": 1.0, "z": 2.0},
        },
    }

    assert validate_inbound_packet(payload) is None


def test_validate_inbound_packet_rejects_event_without_name():
    payload = {
        "type": "event",
        "data": {"payload": {}},
    }

    assert validate_inbound_packet(payload) is None


def test_validate_inbound_packet_rejects_translation_request_without_base_keys():
    payload = {
        "type": "event",
        "data": {
            "event": "request_ui_translations",
            "payload": {"lang": "fr-FR"},
        },
    }

    assert validate_inbound_packet(payload) is None


def test_validate_inbound_packet_rejects_interaction_without_input():
    payload = {
        "type": "event",
        "data": {
            "event": "interaction_turn",
            "payload": {"store": True},
        },
    }

    assert validate_inbound_packet(payload) is None


def test_validate_inbound_packet_rejects_buff_applied_without_kind_or_action():
    payload = {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "payload": {"message": "noop"},
        },
    }

    assert validate_inbound_packet(payload) is None
