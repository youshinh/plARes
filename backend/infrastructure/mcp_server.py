import logging
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import asyncio
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class FirestoreMCPServer:
    """
    Integrates Managed MCP (Model Context Protocol) Servers for Firestore.
    Provides the Gemini AI with tools to autonomously search its database.
    """
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.tools_registered = False
        
        # Ensure Firebase Admin is initialized
        if not firebase_admin._apps:
            # Requires GOOGLE_APPLICATION_CREDENTIALS to be set in env
            firebase_admin.initialize_app()
            
        self.db = firestore.client()

    def register_firestore_tools(self) -> dict:
        """
        Generates the Tool definition for the Gemini API, linking to the
        Managed MCP implementation.
        """
        logger.info(f"Registering Managed MCP tools for Firestore in project {self.project_id}")
        self.tools_registered = True
        
        mcp_tool = {
            "function_declarations": [
                {
                    "name": "search_firestore_logs",
                    "description": "Autonomously query past match logs from Firestore to fetch context about previous rivals or events.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_id": {
                                "type": "string",
                                "description": "The target user's ID."
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Max documents to return (Default 5)"
                            }
                        },
                        "required": ["user_id"]
                    }
                }
            ]
        }
        
        return mcp_tool

    async def execute_tool_search_firestore_logs(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Actual Execution logic for the `search_firestore_logs` MCP Tool.
        Queries the user's past match logs in Firestore.
        """
        user_id = params.get("user_id")
        limit = params.get("limit", 5)
        
        if not user_id:
            raise ValueError("user_id is required for search_firestore_logs")
            
        logger.info(f"MCP executing: search_firestore_logs for user {user_id} limit {limit}")
        
        def _fetch_logs():
            match_logs_ref = self.db.collection('users').document(user_id).collection('matchLogs')
            # Query ordering by timestamp descending
            query = match_logs_ref.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
            docs = query.stream()
            
            results = []
            for doc in docs:
                data = doc.to_dict()
                results.append({
                    "match_id": doc.id,
                    "timestamp": data.get("timestamp"),
                    "result": data.get("result"),
                    "highlight_events": data.get("highlight_events", [])
                })
            return results
            
        # Run synchronous Firestore operations in a thread
        logs = await asyncio.to_thread(_fetch_logs)
        logger.info(f"MCP execute complete: Found {len(logs)} logs.")
        return logs

