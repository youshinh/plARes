import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Callable


class GenAIRequestService:
    def __init__(
        self,
        *,
        get_genai_client: Callable[[str], Any | None],
        genai_types: Any | None,
        normalize_model_name: Callable[[str, str], str],
        normalize_modalities: Callable[[Any], list[str]],
        parse_bool: Callable[[Any, bool], bool],
        to_json_safe: Callable[[Any], Any],
        collect_text_fragments: Callable[[Any, list[str]], None],
        disabled_reason: Callable[[], str],
        ephemeral_api_version: str,
        interactions_api_version: str,
        ephemeral_model: str,
        interactions_model: str,
        ephemeral_default_uses: int,
        ephemeral_expire_minutes: int,
        ephemeral_new_session_minutes: int,
        mcp_firestore_tools: Any | None,
        vertex_cache_instance: Any | None,
    ) -> None:
        self._get_genai_client = get_genai_client
        self._genai_types = genai_types
        self._normalize_model_name = normalize_model_name
        self._normalize_modalities = normalize_modalities
        self._parse_bool = parse_bool
        self._to_json_safe = to_json_safe
        self._collect_text_fragments = collect_text_fragments
        self._disabled_reason = disabled_reason
        self._ephemeral_api_version = ephemeral_api_version
        self._interactions_api_version = interactions_api_version
        self._ephemeral_model = ephemeral_model
        self._interactions_model = interactions_model
        self._ephemeral_default_uses = ephemeral_default_uses
        self._ephemeral_expire_minutes = ephemeral_expire_minutes
        self._ephemeral_new_session_minutes = ephemeral_new_session_minutes
        self._mcp_firestore_tools = mcp_firestore_tools
        self._vertex_cache_instance = vertex_cache_instance

    def issue_ephemeral_token_sync(
        self,
        requested: dict[str, Any],
        user_id: str,
        room_id: str,
    ) -> dict[str, Any]:
        client = self._get_genai_client(self._ephemeral_api_version)
        if client is None or self._genai_types is None:
            return {
                "kind": "live_ephemeral_token",
                "ok": False,
                "error": "gemini_client_unavailable",
                "detail": self._disabled_reason() or "unknown",
                "user_id": user_id,
                "room_id": room_id,
            }

        model = self._normalize_model_name(
            str(requested.get("model", self._ephemeral_model)),
            self._ephemeral_model,
        )
        modalities = self._normalize_modalities(requested.get("response_modalities", ["AUDIO"]))
        uses = requested.get("uses", self._ephemeral_default_uses)
        try:
            uses_value = max(1, min(20, int(uses)))
        except (TypeError, ValueError):
            uses_value = self._ephemeral_default_uses

        expire_minutes = requested.get("expire_minutes", self._ephemeral_expire_minutes)
        try:
            expire_minutes_value = max(1, min(60, int(expire_minutes)))
        except (TypeError, ValueError):
            expire_minutes_value = self._ephemeral_expire_minutes

        new_session_minutes = requested.get("new_session_minutes", self._ephemeral_new_session_minutes)
        try:
            new_session_minutes_value = max(5, min(1440, int(new_session_minutes)))
        except (TypeError, ValueError):
            new_session_minutes_value = self._ephemeral_new_session_minutes

        live_cfg_kwargs: dict[str, Any] = {
            "response_modalities": modalities,
        }

        temperature = requested.get("temperature")
        if isinstance(temperature, (int, float)):
            live_cfg_kwargs["temperature"] = float(temperature)

        system_instruction = requested.get("system_instruction")
        if isinstance(system_instruction, str) and system_instruction.strip():
            live_cfg_kwargs["system_instruction"] = system_instruction.strip()

        if self._parse_bool(requested.get("session_resumption"), True):
            live_cfg_kwargs["session_resumption"] = self._genai_types.SessionResumptionConfig()

        now = datetime.now(timezone.utc)
        try:
            config = self._genai_types.CreateAuthTokenConfig(
                uses=uses_value,
                expire_time=now + timedelta(minutes=expire_minutes_value),
                new_session_expire_time=now + timedelta(minutes=new_session_minutes_value),
                live_connect_constraints=self._genai_types.LiveConnectConstraints(
                    model=model,
                    config=self._genai_types.LiveConnectConfig(**live_cfg_kwargs),
                ),
            )
            token = client.auth_tokens.create(config=config)
        except Exception as exc:
            return {
                "kind": "live_ephemeral_token",
                "ok": False,
                "error": "auth_token_create_failed",
                "detail": str(exc),
                "model": model,
                "response_modalities": modalities,
                "user_id": user_id,
                "room_id": room_id,
            }

        token_payload = self._to_json_safe(token)
        token_name = ""
        if isinstance(token_payload, dict):
            token_name = str(token_payload.get("name", ""))
        if not token_name:
            token_name = str(getattr(token, "name", ""))

        return {
            "kind": "live_ephemeral_token",
            "ok": True,
            "token": token_payload,
            "token_name": token_name,
            "model": model,
            "response_modalities": modalities,
            "uses": uses_value,
            "expire_minutes": expire_minutes_value,
            "new_session_minutes": new_session_minutes_value,
            "issued_at": now.isoformat(),
            "user_id": user_id,
            "room_id": room_id,
        }

    async def issue_ephemeral_token(
        self,
        requested: dict[str, Any],
        user_id: str,
        room_id: str,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self.issue_ephemeral_token_sync, requested, user_id, room_id)

    def run_interaction_sync(
        self,
        requested: dict[str, Any],
        user_id: str,
        room_id: str,
    ) -> dict[str, Any]:
        client = self._get_genai_client(self._interactions_api_version)
        if client is None:
            return {
                "kind": "interaction_response",
                "ok": False,
                "error": "gemini_client_unavailable",
                "detail": self._disabled_reason() or "unknown",
                "user_id": user_id,
                "room_id": room_id,
            }

        input_data = requested.get("input")
        if not input_data:
            return {
                "kind": "interaction_response",
                "ok": False,
                "error": "input_required",
                "user_id": user_id,
                "room_id": room_id,
            }

        model = self._normalize_model_name(
            str(requested.get("model", self._interactions_model)),
            self._interactions_model,
        )
        previous_interaction_id = str(requested.get("previous_interaction_id", "")).strip()
        store_history = self._parse_bool(requested.get("store"), False)
        system_instruction = requested.get("system_instruction")

        kwargs: dict[str, Any] = {
            "api_version": self._interactions_api_version,
            "input": input_data,
            "model": model,
            "store": store_history,
        }
        if previous_interaction_id:
            kwargs["previous_interaction_id"] = previous_interaction_id
        if isinstance(system_instruction, str) and system_instruction.strip():
            kwargs["system_instruction"] = system_instruction.strip()

        generation_config: dict[str, Any] = {}
        temperature = requested.get("temperature")
        if isinstance(temperature, (int, float)):
            generation_config["temperature"] = float(temperature)
        max_output_tokens = requested.get("max_output_tokens")
        if isinstance(max_output_tokens, int) and max_output_tokens > 0:
            generation_config["max_output_tokens"] = max_output_tokens
        if generation_config:
            kwargs["generation_config"] = generation_config

        if self._mcp_firestore_tools and user_id:
            kwargs["tools"] = [self._mcp_firestore_tools]

        if self._vertex_cache_instance is not None:
            cache_id = self._vertex_cache_instance.get_cache_for_user(user_id)
            if cache_id:
                kwargs["cached_content"] = cache_id

        try:
            interaction = client.interactions.create(**kwargs)
        except Exception as exc:
            return {
                "kind": "interaction_response",
                "ok": False,
                "error": "interaction_create_failed",
                "detail": str(exc),
                "model": model,
                "user_id": user_id,
                "room_id": room_id,
            }

        raw = self._to_json_safe(interaction)
        interaction_id = ""
        if isinstance(raw, dict):
            for key in ("id", "name", "interaction_id"):
                value = raw.get(key)
                if isinstance(value, str) and value.strip():
                    interaction_id = value
                    break

        fragments: list[str] = []
        self._collect_text_fragments(raw, fragments)
        text = " ".join(dict.fromkeys(fragments))
        if len(text) > 1600:
            text = text[:1600]

        return {
            "kind": "interaction_response",
            "ok": True,
            "interaction_id": interaction_id,
            "model": model,
            "previous_interaction_id": previous_interaction_id,
            "store": store_history,
            "text": text,
            "raw": raw,
            "user_id": user_id,
            "room_id": room_id,
        }

    async def run_interaction(
        self,
        requested: dict[str, Any],
        user_id: str,
        room_id: str,
    ) -> dict[str, Any]:
        return await asyncio.to_thread(self.run_interaction_sync, requested, user_id, room_id)
