import logging
import asyncio
import datetime
import os
from typing import Dict, Any

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

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
        Creates a cache on Vertex AI for 60 minutes.
        """
        logger.info(f"Creating Vertex AI Context Cache with {len(contents)} documents for User {user_id}")
        
        try:
            # We use an ephemeral client for cache creation based on environment
            client = genai.Client()
            model_name = os.getenv("PLARES_INTERACTIONS_MODEL", "gemini-2.0-flash-exp")
            if not model_name.startswith("models/"):
                model_name = f"models/{model_name}"
            
            def _create():
                return client.caches.create(
                    model=model_name,
                    config=types.CreateCacheConfig(
                        system_instruction=system_instruction,
                        contents=contents,
                        ttl=f"{60 * 60}s",
                    )
                )
                
            cache = await asyncio.to_thread(_create)
            
            cache_id = cache.name
            self.active_caches[user_id] = cache_id
            logger.info(f"Context Caching successful. Cache ID: {cache_id}")
            return cache_id
        except Exception as e:
            logger.error(f"Failed to create Context Cache: {e}")
            return ""
            
    def get_cache_for_user(self, user_id: str) -> str:
        return self.active_caches.get(user_id, "")

