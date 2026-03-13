import logging
import asyncio
import json
import os
from typing import Dict, Any

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = int(os.getenv("PLARES_CACHE_TTL_SECONDS", "3600"))

class VertexContextCache:
    """
    Vertex AI Context Caching integration.
    Uses the `google.genai.caching` API to load massive session context,
    drastically reducing TTFT (Time to First Token).
    """
    def __init__(self):
        self.active_caches: Dict[str, Any] = {}
        # Client initialized globally or per-request depending on architecture
        
    async def load_historical_context(self, user_id: str, system_instruction: str, contents: list) -> str:
        """
        Creates a cache on Vertex AI for the configured TTL (default: 1 hour).
        """
        logger.info(f"Creating Vertex AI Context Cache with {len(contents)} documents for User {user_id}")
        
        try:
            # We use an ephemeral client for cache creation based on environment
            client = genai.Client()
            model_name = os.getenv("PLARES_INTERACTIONS_MODEL", "gemini-3-flash-preview")
            if not model_name.startswith("models/"):
                model_name = f"models/{model_name}"
            
            def _create():
                return client.caches.create(
                    model=model_name,
                    config=types.CreateCacheConfig(
                        system_instruction=system_instruction,
                        contents=contents,
                        ttl=f"{CACHE_TTL_SECONDS}s",
                    )
                )
                
            cache = await asyncio.to_thread(_create)
            
            cache_id = cache.name
            self.active_caches[user_id] = cache_id
            # T3-3: structured JSON log for cache creation
            print(json.dumps({
                "event": "context_cache",
                "action": "create",
                "result": "success",
                "user_id": user_id,
                "cache_id": cache_id,
                "ttl_seconds": CACHE_TTL_SECONDS,
                "doc_count": len(contents),
            }))
            return cache_id
        except Exception as e:
            # T3-3: structured JSON log for cache creation failure
            print(json.dumps({
                "event": "context_cache",
                "action": "create",
                "result": "error",
                "user_id": user_id,
                "error": str(e),
            }))
            logger.error(f"Failed to create Context Cache: {e}")
            return ""
            
    def get_cache_for_user(self, user_id: str) -> str:
        cache_id = self.active_caches.get(user_id, "")
        hit = bool(cache_id)
        # T3-3: structured JSON log for cache hit/miss monitoring
        print(json.dumps({
            "event": "context_cache",
            "action": "lookup",
            "result": "hit" if hit else "miss",
            "user_id": user_id,
            "cache_id": cache_id if hit else None,
        }))
        return cache_id
