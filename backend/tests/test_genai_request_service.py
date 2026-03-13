import pytest

from ai_core.genai_request_service import GenAIRequestService


class FakeInteractionClient:
    def __init__(self):
        self.calls = []
        self.interactions = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return {"id": "ix-1", "text": "hello", "nested": [{"text": "world"}]}


class FakeToken:
    def __init__(self):
        self.name = "token-1"


class FakeAuthTokenClient:
    def __init__(self):
        self.calls = []
        self.auth_tokens = self

    def create(self, config):
        self.calls.append(config)
        return FakeToken()


class FakeGenAITypes:
    class SessionResumptionConfig:
        pass

    class LiveConnectConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

    class LiveConnectConstraints:
        def __init__(self, model, config):
            self.model = model
            self.config = config

    class CreateAuthTokenConfig:
        def __init__(self, **kwargs):
            self.kwargs = kwargs


class FakeVertexCache:
    def get_cache_for_user(self, user_id):
        return f"cache:{user_id}"


def build_service(get_client):
    return GenAIRequestService(
        get_genai_client=get_client,
        genai_types=FakeGenAITypes,
        normalize_model_name=lambda model, fallback: model or fallback,
        normalize_modalities=lambda value: value if isinstance(value, list) else ["AUDIO"],
        parse_bool=lambda value, default: default if value is None else bool(value),
        to_json_safe=lambda value: value if isinstance(value, dict) else {"name": getattr(value, "name", "")},
        collect_text_fragments=lambda value, fragments: fragments.extend(
            [value["text"]] + [item["text"] for item in value.get("nested", []) if isinstance(item, dict) and "text" in item]
        )
        if isinstance(value, dict) and "text" in value
        else None,
        disabled_reason=lambda: "missing_client",
        ephemeral_api_version="v1alpha",
        interactions_api_version="v1alpha",
        ephemeral_model="models/gemini-2.5-flash-native-audio-preview-12-2025",
        interactions_model="gemini-3-flash-preview",
        ephemeral_default_uses=3,
        ephemeral_expire_minutes=10,
        ephemeral_new_session_minutes=60,
        mcp_firestore_tools={"kind": "tool"},
        vertex_cache_instance=FakeVertexCache(),
    )


def test_run_interaction_sync_adds_tools_and_cache():
    client = FakeInteractionClient()
    service = build_service(lambda _api_version: client)

    result = service.run_interaction_sync(
        {
            "input": [{"role": "user", "parts": [{"text": "hello"}]}],
            "store": True,
            "temperature": 0.3,
            "max_output_tokens": 128,
        },
        user_id="u1",
        room_id="room-1",
    )

    assert result["ok"] is True
    assert result["interaction_id"] == "ix-1"
    assert result["text"] == "hello world"
    call = client.calls[-1]
    assert call["tools"] == [{"kind": "tool"}]
    assert call["cached_content"] == "cache:u1"
    assert call["generation_config"] == {"temperature": 0.3, "max_output_tokens": 128}


def test_issue_ephemeral_token_sync_returns_token_payload():
    client = FakeAuthTokenClient()
    service = build_service(lambda _api_version: client)

    result = service.issue_ephemeral_token_sync(
        {
            "response_modalities": ["AUDIO"],
            "temperature": 0.4,
            "session_resumption": True,
        },
        user_id="u1",
        room_id="room-1",
    )

    assert result["ok"] is True
    assert result["token_name"] == "token-1"
    assert result["response_modalities"] == ["AUDIO"]
    assert client.calls


def test_run_interaction_sync_requires_input():
    service = build_service(lambda _api_version: None)

    result = service.run_interaction_sync({}, user_id="u1", room_id="room-1")

    assert result["ok"] is False
    assert result["error"] == "gemini_client_unavailable"
