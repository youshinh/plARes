from ai_core.ui_payloads import initial_tactics_payload, lang_bucket, special_phrase_for_lang, tone_message


def test_lang_bucket_maps_ja_and_es():
    assert lang_bucket("ja-JP") == "ja"
    assert lang_bucket("es-ES") == "es"
    assert lang_bucket("en-US") == "en"


def test_special_phrase_for_lang_returns_localized_text():
    assert special_phrase_for_lang("ja-JP") == "超絶熱々揚げ春巻きストライク"
    assert special_phrase_for_lang("es-ES") == "El perro de San Roque no tiene rabo"


def test_tone_message_falls_back_for_unknown_tone():
    assert tone_message("ja-JP", "mystery").startswith("機体の口調が")
    assert tone_message("en-US", "mystery") == "Persona tone shifted to 'mystery'"


def test_initial_tactics_payload_wraps_buff_event():
    payload = initial_tactics_payload("en-US")

    assert payload["type"] == "event"
    assert payload["data"]["event"] == "buff_applied"
    assert len(payload["data"]["payload"]) == 2
