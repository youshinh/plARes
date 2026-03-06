import os

from ai_core.genai_client_factory import GenAIClientFactory


class FakeClientModule:
    def __init__(self):
        self.calls = []

    def Client(self, **kwargs):
        self.calls.append(kwargs)
        return {"client": kwargs}


def test_get_client_caches_by_api_version(monkeypatch):
    module = FakeClientModule()
    monkeypatch.setenv("GEMINI_API_KEY", "secret")
    factory = GenAIClientFactory(genai_module=module, genai_types_module=object())

    first = factory.get_client("v1alpha")
    second = factory.get_client("v1alpha")

    assert first is second
    assert len(module.calls) == 1


def test_resolve_gemini_api_key_removes_legacy_env(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "secret")
    monkeypatch.setenv("GOOGLE_API_KEY", "legacy")

    api_key = GenAIClientFactory.resolve_gemini_api_key()

    assert api_key == "secret"
    assert os.getenv("GOOGLE_API_KEY") is None
