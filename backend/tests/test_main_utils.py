import pytest
from ai_core.utils import safe_json_loads
from ai_core.genai_helpers import collect_text_fragments

def test_safe_json_loads_valid_dict():
    message = '{"key": "value"}'
    result = safe_json_loads(message)
    assert result == {"key": "value"}

def test_safe_json_loads_invalid_json():
    message = '{"key": "value"'  # Missing closing brace
    result = safe_json_loads(message)
    assert result is None

def test_safe_json_loads_not_a_dict():
    message = '[1, 2, 3]'
    result = safe_json_loads(message)
    assert result is None

def test_safe_json_loads_string_not_json():
    message = 'not a json'
    result = safe_json_loads(message)
    assert result is None

def test_safe_json_loads_empty_string():
    message = ''
    result = safe_json_loads(message)
    assert result is None

def test_safe_json_loads_non_string():
    result = safe_json_loads(None)
    assert result is None
    result = safe_json_loads(123)
    assert result is None


def test_collect_text_fragments_skips_thought_and_model_metadata():
    fragments: list[str] = []
    collect_text_fragments(
        {
            "model": "models/gemini-3-flash-preview",
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "右に回り込め。"},
                            {"thoughtSignature": "EvkDCvYDAb4+9vua+rexPWp"},
                        ]
                    }
                }
            ],
            "status": "incomplete",
        },
        fragments,
    )

    assert fragments == ["右に回り込め。"]
