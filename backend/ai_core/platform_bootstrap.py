import os
from pathlib import Path
from typing import Any


def load_environment(load_dotenv: Any | None, module_file: str) -> None:
    if load_dotenv is None:
        return
    env_path = Path(module_file).resolve().parents[1] / ".env"
    load_dotenv(env_path, override=False)


def init_mcp_tools(firestore_mcp_server_cls: Any | None, logger: Any) -> tuple[Any | None, Any | None]:
    if firestore_mcp_server_cls is None:
        return None, None
    try:
        server = firestore_mcp_server_cls(os.getenv("GCP_PROJECT", "plaresar"))
        return server, server.register_firestore_tools()
    except Exception as exc:
        logger.error(f"MCP init failed: {exc}", exc_info=True)
        return None, None


def init_vertex_cache(vertex_context_cache_cls: Any | None, logger: Any) -> Any | None:
    if vertex_context_cache_cls is None:
        return None
    try:
        return vertex_context_cache_cls()
    except Exception as exc:
        logger.error(f"Vertex cache init failed: {exc}", exc_info=True)
        return None
