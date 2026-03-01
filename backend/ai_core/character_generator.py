"""
character_generator.py
──────────────────────────────────────────────────────────────────────────────
初回キャラクター（プラレスラー）生成パイプライン

フロー:
  1. フロントエンドが顔写真(Base64 JPEG) またはテキストプロンプトをPOST
  2. Gemini 3.1 Pro Visionがロボットの初期パラメーターをJSONで返す
  3. 合計200ポイントキャップ処理後、Firestoreへ登録
  4. フロントエンドがJSONを受け取りThree.jsで動的レンダリング

設計参照:
  NotebookLM: "顔写真からロボットのパラメータを生成するフロー"
  (notebook_id: 46106b3a-80d5-4567-85c4-25dc3ee293cc)
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from typing import Optional

try:
    from google import genai  # type: ignore
    from google.genai import types as genai_types  # type: ignore
except Exception:
    genai = None
    genai_types = None

# ── 定数 ─────────────────────────────────────────────────────────────────────

GENERATION_MODEL = (
    os.getenv("PLARES_CHARACTER_MODEL")
    or os.getenv("PLARES_LIGHT_MODEL")
    or "gemini-3-flash-preview"
)

STAT_KEYS = ("power", "speed", "vit", "talkSkill", "adlibSkill")
STAT_CAP = 200          # 全パラメーター合計の上限
DEFAULT_SYNC_RATE = 10.0
DEFAULT_UNISON = 100.0
DNA_SILHOUETTES = ("striker", "tank", "ace")
DNA_FINISHES = ("matte", "satin", "gloss")
DNA_PALETTES = ("ember", "marine", "forest", "royal", "obsidian", "sunset")

# ── プロンプト ────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
あなたはプラレスラー（小型対戦ロボット）の凄腕エンジニアです。
入力されたユーザーの顔写真（または性格テキスト）から、
その人物の「オーラ、骨格、表情の豊かさ」を分析し、
相棒となるロボットの初期パラメーターを設計してください。

【マッピングルール】
- 表情が豊かで笑顔        → talkSkill（愛嬌）を高く
- 顎のラインがしっかり     → power や vit を高めに
- 目つきが鋭い            → speed を高めに
- 全体的に穏やか          → adlibSkill（機転）を高く

【制約】
- material は "Wood"（打撃耐性）/ "Metal"（高防御・高火力）/ "Resin"（軽量・高機動）から1つ
- materialType は対象物の質感を表す英単語 ("wood", "metal", "plastic", "energy", "fabric", "stone" 等)
- 全パラメーター（power + speed + vit + talkSkill + adlibSkill）の合計は200以内
- suggestedName は日本語のロボット名（15文字以内）
- tone は実況・TTSに使う性格文字列（例: "関西弁の熱血漢"）

【出力形式】JSONのみ。説明文不要。
{"material":"Wood","materialType":"plastic","power":0,"speed":0,"vit":0,"talkSkill":0,"adlibSkill":0,\
"suggestedName":"名前","tone":"性格"}
"""

_TEXT_USER_PROMPT = """\
以下のテキストからプラレスラーの初期パラメーターを設計してください:
{description}
"""

# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _get_client() -> Optional[object]:
    if genai is None:
        return None
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    # Enforce GEMINI_API_KEY as single source of truth for SDK initialization.
    if api_key and os.getenv("GOOGLE_API_KEY"):
        os.environ.pop("GOOGLE_API_KEY", None)
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception:
        return None


def _cap_stats(raw: dict) -> dict:
    """全stat合計がSTAT_CAPを超えている場合、比例縮小する"""
    total = sum(raw.get(k, 0) for k in STAT_KEYS)
    if total <= 0:
        return raw
    if total > STAT_CAP:
        ratio = STAT_CAP / total
        for k in STAT_KEYS:
            raw[k] = max(1, int(raw.get(k, 0) * ratio))
    return raw


def _extract_json(text: str) -> dict:
    """LLMの出力からJSONブロックを抽出する"""
    # ```json ... ``` ブロックがあれば抽出
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        text = match.group(1)
    # 先頭の { から末尾の } を抽出
    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]
    return json.loads(text)


def _build_character_dna(
    *,
    name: str,
    material: str,
    tone: str,
    power: int,
    speed: int,
    vit: int,
    face_image_base64: Optional[str],
    preset_text: Optional[str],
    material_type: str = "plastic",
) -> dict:
    face_hint = (face_image_base64 or "")[:512]
    seed_source = "|".join(
        [
            name,
            material,
            tone,
            str(power),
            str(speed),
            str(vit),
            preset_text or "",
            face_hint,
            material_type,
        ]
    )
    digest = hashlib.sha256(seed_source.encode("utf-8")).hexdigest()
    seed = int(digest[:8], 16)

    silhouette = "ace"
    if power >= speed + 12:
        silhouette = "tank"
    elif speed >= power + 12:
        silhouette = "striker"

    finish = "satin"
    if material == "Metal":
        finish = "gloss"
    elif material == "Wood":
        finish = "matte"

    palette = DNA_PALETTES[seed % len(DNA_PALETTES)]
    tone_l = tone.lower()
    if "熱血" in tone or "aggressive" in tone_l:
        palette = "ember"
    elif "冷静" in tone or "cool" in tone_l:
        palette = "marine"
    elif "関西" in tone or "fun" in tone_l:
        palette = "sunset"

    eye_glow_by_palette = {
        "ember": "#FFB86E",
        "marine": "#73E4FF",
        "forest": "#9BFFD2",
        "royal": "#C8C7FF",
        "obsidian": "#95E5FF",
        "sunset": "#FFCAA0",
    }
    return {
        "version": "v1",
        "seed": seed,
        "silhouette": silhouette if silhouette in DNA_SILHOUETTES else "ace",
        "finish": finish if finish in DNA_FINISHES else "satin",
        "paletteFamily": palette if palette in DNA_PALETTES else "marine",
        "eyeGlow": eye_glow_by_palette.get(palette, "#73E4FF"),
        "scarLevel": 0,
        "glowIntensity": 1.0,
        "evolutionStage": 0,
        "battlePatina": "clean",
        "materialType": material_type,
        "emblemUrl": "",
    }


def _normalize_result(raw: dict, face_image_base64: Optional[str], preset_text: Optional[str]) -> dict:
    """Geminiの出力を正規化・バリデーションし、フロントエンド向けdictを返す"""
    material = raw.get("material", "Wood")
    if material not in {"Wood", "Metal", "Resin"}:
        material = "Wood"

    stats = {
        "power":      max(1, min(99, int(raw.get("power", 40)))),
        "speed":      max(1, min(99, int(raw.get("speed", 40)))),
        "vit":        max(1, min(99, int(raw.get("vit",   40)))),
        "talkSkill":  max(1, min(99, int(raw.get("talkSkill",  30)))),
        "adlibSkill": max(1, min(99, int(raw.get("adlibSkill", 30)))),
    }
    stats = _cap_stats(stats)

    name = str(raw.get("suggestedName", "レスラーMk1"))[:20]
    tone = str(raw.get("tone", "balanced"))[:50]
    material_type = str(raw.get("materialType", "plastic"))[:20]

    character_dna = raw.get("characterDna")
    if not isinstance(character_dna, dict):
        character_dna = _build_character_dna(
            name=name,
            material=material,
            tone=tone,
            power=stats["power"],
            speed=stats["speed"],
            vit=stats["vit"],
            face_image_base64=face_image_base64,
            preset_text=preset_text,
            material_type=material_type,
        )

    # Canonical contract-first shape (frontend/shared types) + legacy flat keys.
    return {
        "name":     name,
        "material": material,
        "stats": {
            "power": stats["power"],
            "speed": stats["speed"],
            "vit": stats["vit"],
        },
        "personality": {
            "talkSkill": stats["talkSkill"],
            "adlibSkill": stats["adlibSkill"],
            "tone": tone,
        },
        "network": {
            "syncRate": DEFAULT_SYNC_RATE,
            "unison": DEFAULT_UNISON,
        },
        "characterDna": character_dna,

        # Backward compatibility for older clients.
        "power":    stats["power"],
        "speed":    stats["speed"],
        "vit":      stats["vit"],
        "talk_skill":  stats["talkSkill"],
        "adlib_skill": stats["adlibSkill"],
        "tone":     tone,
        "character_dna": character_dna,
    }


def _fallback_result(preset_text: Optional[str]) -> dict:
    """APIが使えない場合のフォールバック（テキストヒューリスティック）"""
    tone = preset_text or "balanced"
    # 簡易キーワードマッピング
    kw = (preset_text or "").lower()
    power      = 60 if any(w in kw for w in ("力", "パワー", "攻撃", "ゴリラ")) else 40
    speed      = 60 if any(w in kw for w in ("速", "スピード", "俊足", "機敏")) else 40
    vit        = 60 if any(w in kw for w in ("耐久", "タフ", "防御", "守り")) else 40
    talk_skill = 60 if any(w in kw for w in ("話す", "愛嬌", "面白", "トーク")) else 30
    adlib      = 30
    result = {
        "name": "レスラーMk1",
        "material": "Wood",
        "power": power,
        "speed": speed,
        "vit": vit,
        "talk_skill": talk_skill,
        "adlib_skill": adlib,
        "tone": tone,
    }
    character_dna = _build_character_dna(
        name=result["name"],
        material=result["material"],
        tone=result["tone"],
        power=result["power"],
        speed=result["speed"],
        vit=result["vit"],
        face_image_base64=None,
        preset_text=preset_text,
        material_type="plastic",
    )
    result["character_dna"] = character_dna
    result["characterDna"] = character_dna
    result["stats"] = {
        "power": result["power"],
        "speed": result["speed"],
        "vit": result["vit"],
    }
    result["personality"] = {
        "talkSkill": result["talk_skill"],
        "adlibSkill": result["adlib_skill"],
        "tone": result["tone"],
    }
    result["network"] = {
        "syncRate": DEFAULT_SYNC_RATE,
        "unison": DEFAULT_UNISON,
    }
    return result


# ── メイン関数 ────────────────────────────────────────────────────────────────

async def generate_robot_stats(
    face_image_base64: Optional[str] = None,
    preset_text: Optional[str] = None,
) -> dict:
    """
    顔写真またはテキストからプラレスラーの初期パラメーターを生成する。

    Returns:
        {
          "name": str, "material": str,
          "power": int, "speed": int, "vit": int,
          "talk_skill": int, "adlib_skill": int, "tone": str,
        }
    """
    client = _get_client()
    if client is None:
        result = _fallback_result(preset_text)
        result["error_code"] = "model_unavailable"
        result["is_fallback"] = True
        print(json.dumps({"event": "character_generation", "error_code": "model_unavailable"}))
        return result

    try:
        contents: list = []

        if face_image_base64:
            # 顔写真あり → マルチモーダル入力
            # Base64ヘッダ("data:image/jpeg;base64,")があれば除去
            b64 = face_image_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            image_bytes = base64.b64decode(b64)

            if genai_types is not None:
                contents = [
                    genai_types.Part.from_bytes(image_bytes, mime_type="image/jpeg"),
                    genai_types.Part.from_text(
                        "この人物の顔写真からプラレスラーのパラメーターを設計してください。"
                    ),
                ]
            else:
                # fallback: テキストのみ
                contents = ["顔写真の代わりにデフォルト設定で設計してください。"]
        else:
            # テキストのみ
            desc = preset_text or "熱血漢でスピード重視のロボット"
            contents = [_TEXT_USER_PROMPT.format(description=desc)]

        response = client.models.generate_content(
            model=GENERATION_MODEL,
            contents=contents,
            config={
                "system_instruction": _SYSTEM_PROMPT,
                "temperature": 0.7,
                "max_output_tokens": 256,
            },
        )

        text = ""
        if hasattr(response, "text"):
            text = response.text or ""
        elif hasattr(response, "candidates") and response.candidates:
            parts = response.candidates[0].content.parts
            text = "".join(getattr(p, "text", "") for p in parts)

        raw = _extract_json(text)
        return _normalize_result(raw, face_image_base64, preset_text)

    except Exception as exc:
        # JSON解析失敗・API障害時はフォールバック
        error_code = "gemini_api_error"
        if "quota" in str(exc).lower() or "429" in str(exc):
            error_code = "gemini_quota_exceeded"
        print(json.dumps({"event": "character_generation", "error_code": error_code, "error": str(exc)}))
        result = _fallback_result(preset_text)
        result["error_code"] = error_code
        result["is_fallback"] = True
        return result


def build_robot_profile(result: dict, sync_rate: float = DEFAULT_SYNC_RATE) -> dict:
    """
    generate_robot_stats()の結果をFirestore/ローカルの robot サブドキュメント形式に変換する。
    main.py の _default_user_profile["robot"] と同じ構造に合わせる。
    """
    return {
        "name":     result["name"],
        "material": result["material"],
        "level":    1,
        "stats": {
            "power": result["power"],
            "speed": result["speed"],
            "vit":   result["vit"],
        },
        "personality": {
            "talk_skill":  result["talk_skill"],
            "adlib_skill": result["adlib_skill"],
            "tone":        result["tone"],
        },
        "network": {
            "sync_rate": sync_rate,
            "unison":    DEFAULT_UNISON,
        },
        "character_dna": result.get("character_dna"),
    }
