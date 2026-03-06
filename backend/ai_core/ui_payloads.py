from typing import Any


def lang_bucket(lang: str) -> str:
    lowered = (lang or "en-US").lower()
    if lowered.startswith("ja"):
        return "ja"
    if lowered.startswith("es"):
        return "es"
    return "en"


def localized_tactics(lang: str) -> list[dict[str, Any]]:
    bucket = lang_bucket(lang)
    if bucket == "ja":
        return [
            {
                "id": "tactics_cover",
                "title": "障害物へ退避",
                "detail": "敵の大技を待ってカウンター",
                "action": "take_cover",
                "target": {"x": 0.8, "y": 0.0, "z": -1.2},
            },
            {
                "id": "tactics_flank",
                "title": "右側面を取る",
                "detail": "横移動で死角を作る",
                "action": "flank_right",
                "target": {"x": 1.5, "y": 0.0, "z": -1.6},
            },
        ]
    if bucket == "es":
        return [
            {
                "id": "tactics_cover",
                "title": "Refugiate tras cobertura",
                "detail": "Espera la tecnica fuerte y contraataca",
                "action": "take_cover",
                "target": {"x": 0.8, "y": 0.0, "z": -1.2},
            },
            {
                "id": "tactics_flank",
                "title": "Flanquea por derecha",
                "detail": "Crea un angulo muerto con movimiento lateral",
                "action": "flank_right",
                "target": {"x": 1.5, "y": 0.0, "z": -1.6},
            },
        ]
    return [
        {
            "id": "tactics_cover",
            "title": "Take Cover",
            "detail": "Wait for the enemy special and counter",
            "action": "take_cover",
            "target": {"x": 0.8, "y": 0.0, "z": -1.2},
        },
        {
            "id": "tactics_flank",
            "title": "Flank Right",
            "detail": "Create a blind spot with lateral movement",
            "action": "flank_right",
            "target": {"x": 1.5, "y": 0.0, "z": -1.6},
        },
    ]


def special_phrase_for_lang(lang: str) -> str:
    bucket = lang_bucket(lang)
    if bucket == "ja":
        return "超絶熱々揚げ春巻きストライク"
    if bucket == "es":
        return "El perro de San Roque no tiene rabo"
    return "Super Sonic Scorching Spring Roll Strike"


def tone_message(lang: str, tone: str) -> str:
    bucket = lang_bucket(lang)
    if bucket == "ja":
        messages = {
            "focused": "機体の口調が集中モードへ変化",
            "balanced": "機体の口調が標準モードへ戻った",
            "confident": "機体の口調が強気モードへ変化",
            "distrustful": "機体の口調がやさぐれた",
            "kansai_okan": "機体の口調が関西のオカン化",
        }
    elif bucket == "es":
        messages = {
            "focused": "El tono cambio a modo concentrado",
            "balanced": "El tono volvio al modo equilibrado",
            "confident": "El tono cambio a modo confiado",
            "distrustful": "El tono se volvio desconfiado",
            "kansai_okan": "El tono cambio a estilo Kansai",
        }
    else:
        messages = {
            "focused": "Persona tone shifted to focused mode",
            "balanced": "Persona tone returned to balanced mode",
            "confident": "Persona tone shifted to confident mode",
            "distrustful": "Persona tone drifted to distrustful mode",
            "kansai_okan": "Persona tone shifted to Kansai mom style",
        }
    if tone in messages:
        return messages[tone]
    if bucket == "ja":
        return f"機体の口調が「{tone}」に変化"
    if bucket == "es":
        return f"El tono cambio a '{tone}'"
    return f"Persona tone shifted to '{tone}'"


def initial_tactics_payload(lang: str) -> dict[str, Any]:
    return {
        "type": "event",
        "data": {
            "event": "buff_applied",
            "user": "server",
            "payload": localized_tactics(lang),
        },
    }
