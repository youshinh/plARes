"""
mcp_server.py
──────────────────────────────────────────────────────────────────────────────
Managed MCP (Model Context Protocol) server for Firestore.
Provides the Gemini AI with tools to autonomously search match history.

Skill Reference: skills/agent3/mcp-builder/SKILL.md

Safety:
  - Input sanitization (limit capped, user_id validated)
  - Graceful fallback when Firebase Admin SDK is unavailable
  - Structured JSON logging for every tool execution
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

FIRESTORE_MODE = os.getenv("PLARES_FIRESTORE_MODE", "on")
MAX_LOG_LIMIT = 10  # Per mcp-builder skill: prevent unrestricted DB scans

# ── Graceful SDK Import ───────────────────────────────────────────────────────

_firebase_available = False
_db = None

if FIRESTORE_MODE != "off":
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials, firestore  # type: ignore

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _db = firestore.client()
        _firebase_available = True
    except Exception as e:
        logger.warning(f"[MCP] Firebase Admin SDK unavailable: {e}")


# ── Sanitization ──────────────────────────────────────────────────────────────

_USER_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,128}$")


def _sanitize_user_id(user_id: Any) -> str:
    """Validate user_id format to prevent injection."""
    uid = str(user_id or "").strip()
    if not uid or not _USER_ID_PATTERN.match(uid):
        raise ValueError(f"Invalid user_id format: {uid!r}")
    return uid


def _sanitize_limit(limit: Any) -> int:
    """Clamp limit to [1, MAX_LOG_LIMIT]."""
    try:
        n = int(limit)
    except (TypeError, ValueError):
        n = 5
    return max(1, min(n, MAX_LOG_LIMIT))


# ── MCP Server ────────────────────────────────────────────────────────────────

class FirestoreMCPServer:
    """
    Integrates Managed MCP Servers for Firestore.
    Provides the Gemini AI with tools to autonomously search its database.
    """

    def __init__(self, project_id: str = ""):
        self.project_id = project_id or os.getenv("GOOGLE_CLOUD_PROJECT", "")
        self.tools_registered = False

    def register_firestore_tools(self) -> dict:
        """
        Generates the Tool definition for the Gemini API.
        """
        logger.info(f"Registering Managed MCP tools for Firestore in project {self.project_id}")
        self.tools_registered = True

        mcp_tool = {
            "function_declarations": [
                {
                    "name": "search_firestore_logs",
                    "description": (
                        "Autonomously query past match logs from Firestore "
                        "to fetch context about previous rivals or events."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_id": {
                                "type": "string",
                                "description": "The target user's ID (alphanumeric, max 128 chars).",
                            },
                            "limit": {
                                "type": "integer",
                                "description": f"Max documents to return (1-{MAX_LOG_LIMIT}, default 5).",
                            },
                        },
                        "required": ["user_id"],
                    },
                }
            ]
        }

        return mcp_tool

    async def execute_tool_search_firestore_logs(
        self, params: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Execute the search_firestore_logs MCP tool.
        Queries past match logs with input sanitization and structured logging.
        """
        user_id = _sanitize_user_id(params.get("user_id"))
        limit = _sanitize_limit(params.get("limit", 5))

        print(json.dumps({
            "event": "mcp_tool_execute",
            "tool": "search_firestore_logs",
            "user_id": user_id,
            "limit": limit,
        }))

        if not _firebase_available or _db is None:
            logger.warning("[MCP] Firestore unavailable, returning empty result")
            print(json.dumps({
                "event": "mcp_tool_result",
                "tool": "search_firestore_logs",
                "result": "firestore_unavailable",
                "count": 0,
            }))
            return []

        try:
            def _fetch_logs():
                match_logs_ref = _db.collection("users").document(user_id).collection("matchLogs")
                query = (
                    match_logs_ref
                    .order_by("timestamp", direction=firestore.Query.DESCENDING)
                    .limit(limit)
                )
                docs = query.stream()

                results = []
                for doc in docs:
                    data = doc.to_dict()
                    results.append({
                        "match_id": doc.id,
                        "timestamp": str(data.get("timestamp", "")),
                        "result": data.get("result"),
                        "highlight_events": data.get("highlight_events", []),
                    })
                return results

            logs = await asyncio.to_thread(_fetch_logs)

            print(json.dumps({
                "event": "mcp_tool_result",
                "tool": "search_firestore_logs",
                "result": "success",
                "count": len(logs),
                "user_id": user_id,
            }))
            return logs

        except Exception as e:
            print(json.dumps({
                "event": "mcp_tool_result",
                "tool": "search_firestore_logs",
                "result": "error",
                "error": str(e),
                "user_id": user_id,
            }))
            logger.error(f"[MCP] Firestore query failed: {e}")
            return []
