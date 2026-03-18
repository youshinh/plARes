import json
from typing import Any, Callable


class CharacterSessionService:
    def __init__(
        self,
        *,
        safe_json_loads: Callable[[str], dict[str, Any] | None],
        generate_robot_stats: Callable[..., Any] | None,
        persist_generated_profile: Callable[[str, dict[str, Any]], None] | None,
        logger: Any,
        connection_closed_exception: type[Exception],
    ) -> None:
        self._safe_json_loads = safe_json_loads
        self._generate_robot_stats = generate_robot_stats
        self._persist_generated_profile = persist_generated_profile
        self._logger = logger
        self._connection_closed_exception = connection_closed_exception

    async def handle_connection(self, websocket: Any, _request_path: str) -> None:
        try:
            message = await websocket.recv()
            if isinstance(message, bytes):
                message = message.decode("utf-8")

            request_data = self._safe_json_loads(message)
            if not request_data:
                await websocket.send(json.dumps({"error": "Invalid JSON format"}))
                return

            face_image_base64 = request_data.get("face_image_base64")
            preset_text = request_data.get("preset_text")
            model_type = request_data.get("model_type")

            if self._generate_robot_stats is None:
                await websocket.send(
                    json.dumps(
                        {
                            "error": "Character generator not available",
                            "error_code": "module_not_loaded",
                        }
                    )
                )
                return

            result = await self._generate_robot_stats(
                face_image_base64=face_image_base64,
                preset_text=preset_text,
                model_type=model_type,
            )
            user_id = str(request_data.get("user_id", "")).strip()
            if user_id and self._persist_generated_profile is not None:
                try:
                    self._persist_generated_profile(user_id, result)
                except Exception as exc:
                    self._logger.error(
                        json.dumps(
                            {
                                "event": "character_profile_persist",
                                "error_code": "persist_failed",
                                "error": str(exc),
                            }
                        ),
                        exc_info=True,
                    )
            await websocket.send(json.dumps(result, ensure_ascii=False))
        except self._connection_closed_exception:
            pass
        except Exception as exc:
            self._logger.error(
                json.dumps(
                    {
                        "event": "character_generation",
                        "error_code": "server_error",
                        "error": str(exc),
                    }
                ),
                exc_info=True,
            )
            try:
                await websocket.send(json.dumps({"error": "An internal error occurred.", "error_code": "server_error"}))
            except Exception:
                pass
        finally:
            await websocket.close()
