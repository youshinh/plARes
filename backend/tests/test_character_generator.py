import json

import pytest

from ai_core import character_generator


@pytest.mark.asyncio
async def test_generate_robot_stats_applies_generated_skin_url_on_fallback(monkeypatch):
    monkeypatch.setattr(character_generator, "_get_client", lambda: None)
    monkeypatch.setattr(
        character_generator,
        "_generate_face_texture_data_url",
        lambda _face_image_base64: "data:image/png;base64,generated",
    )

    result = await character_generator.generate_robot_stats(
        face_image_base64="data:image/jpeg;base64,raw",
        preset_text="speed type",
        model_type="wood_slim",
    )

    assert result["characterDna"]["skinUrl"] == "data:image/png;base64,generated"
    assert result["character_dna"]["skinUrl"] == "data:image/png;base64,generated"


def test_generate_face_texture_data_url_uses_image_response(monkeypatch):
    captured = {}

    class DummyResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "inlineData": {
                                            "mimeType": "image/png",
                                            "data": "generated-image",
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ).encode("utf-8")

    def fake_urlopen(req, timeout):
        captured["url"] = req.full_url
        captured["timeout"] = timeout
        captured["body"] = json.loads(req.data.decode("utf-8"))
        return DummyResponse()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(character_generator.urllib_request, "urlopen", fake_urlopen)
    monkeypatch.setattr(character_generator, "FACE_TEXTURE_IMAGE_SIZES", ("512",))

    result = character_generator._generate_face_texture_data_url("data:image/png;base64,input-image")

    assert result == "data:image/png;base64,generated-image"
    assert "gemini-3.1-flash-image-preview:generateContent" in captured["url"]
    assert captured["timeout"] == character_generator.FACE_TEXTURE_TIMEOUT_SEC
    assert captured["body"]["generationConfig"]["responseModalities"] == ["IMAGE"]
    assert captured["body"]["generationConfig"]["imageConfig"]["aspectRatio"] == "1:1"
    assert captured["body"]["contents"][0]["parts"][0]["inlineData"]["data"] == "input-image"
