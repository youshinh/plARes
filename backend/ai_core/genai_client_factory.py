import os
from typing import Any


class GenAIClientFactory:
    def __init__(
        self,
        *,
        genai_module: Any | None,
        genai_types_module: Any | None,
    ) -> None:
        self._genai_module = genai_module
        self._genai_types_module = genai_types_module
        self._clients: dict[str, Any] = {}
        self._disabled_reason = ""

    @property
    def disabled_reason(self) -> str:
        return self._disabled_reason

    @property
    def genai_types(self) -> Any | None:
        return self._genai_types_module

    @staticmethod
    def resolve_gemini_api_key() -> str:
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if api_key and os.getenv("GOOGLE_API_KEY"):
            os.environ.pop("GOOGLE_API_KEY", None)
        return api_key

    def get_client(self, api_version: str) -> Any | None:
        cached = self._clients.get(api_version)
        if cached is not None:
            return cached
        if self._genai_module is None or self._genai_types_module is None:
            self._disabled_reason = "google_genai_unavailable"
            return None
        api_key = self.resolve_gemini_api_key()
        if not api_key:
            self._disabled_reason = "api_key_missing"
            return None

        try:
            client = self._genai_module.Client(api_key=api_key, http_options={"api_version": api_version})
        except Exception:
            try:
                client = self._genai_module.Client(api_key=api_key)
            except Exception as exc:
                self._disabled_reason = str(exc)
                return None

        self._clients[api_version] = client
        return client
