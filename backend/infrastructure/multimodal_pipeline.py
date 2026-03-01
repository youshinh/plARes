"""
multimodal_pipeline.py
──────────────────────────────────────────────────────────────────────────────
Event-driven generation pipelines for heavy AI tasks.

Pipelines:
  1. RealityFusionCrafter — image generation for texture fusion
  2. MilestoneVideoGenerator — music queueing and milestone video queueing
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

IMAGEN_MODEL = os.getenv("PLARES_IMAGEN_MODEL", "gemini-3.1-flash-image-preview")
MUSIC_MODEL = os.getenv("PLARES_MUSIC_MODEL", "gemini-2.5-flash-preview-tts")
GCP_PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "")
PUBSUB_ENABLED = os.getenv("PLARES_PUBSUB_ENABLED", "false").lower() == "true"
FUSION_BUCKET = os.getenv("PLARES_FUSION_BUCKET", "").strip()
FUSION_PUBLIC_BASE_URL = os.getenv("PLARES_FUSION_PUBLIC_BASE_URL", "").strip()
VICTORY_BGM_BASE_URL = os.getenv("PLARES_VICTORY_BGM_BASE_URL", "").strip()
MAX_RETRIES = max(1, int(os.getenv("PLARES_GENAI_MAX_RETRIES", "3")))

# ── SDK Imports (graceful fallback) ───────────────────────────────────────────

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    genai = None  # type: ignore
    genai_types = None

try:
    from google.cloud import pubsub_v1  # type: ignore
except ImportError:
    pubsub_v1 = None

try:
    from google.cloud import storage  # type: ignore
except ImportError:
    storage = None


def _json_log(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def _get_genai_client():
    """Return a genai.Client or None if SDK/API key unavailable."""
    if genai is None:
        return None
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception:
        return None


async def _retry_with_backoff(label: str, coro_factory):
    """Retry transient operations with 1s -> 2s -> 4s backoff."""
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return await coro_factory()
        except Exception as exc:  # pragma: no cover - network dependent
            last_exc = exc
            if attempt >= MAX_RETRIES - 1:
                break
            wait_sec = 2**attempt
            _json_log({
                "event": "retry_backoff",
                "label": label,
                "attempt": attempt + 1,
                "wait_sec": wait_sec,
                "error": str(exc),
            })
            await asyncio.sleep(wait_sec)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"{label} failed without exception")


def _extract_image_bytes(response: Any) -> bytes | None:
    """Extract image bytes from several possible SDK response shapes."""
    # generate_images response shape
    generated_images = getattr(response, "generated_images", None)
    if generated_images:
        first = generated_images[0]
        image_obj = getattr(first, "image", None)
        if image_obj is not None:
            image_bytes = getattr(image_obj, "image_bytes", None)
            if isinstance(image_bytes, (bytes, bytearray)) and image_bytes:
                return bytes(image_bytes)

    # generate_content inline data response shape
    candidates = getattr(response, "candidates", None)
    if candidates:
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            if not parts:
                continue
            for part in parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data is not None:
                    data = getattr(inline_data, "data", None)
                    if isinstance(data, (bytes, bytearray)) and data:
                        return bytes(data)
                    b64 = getattr(inline_data, "data_base64", None)
                    if isinstance(b64, str) and b64:
                        try:
                            return base64.b64decode(b64)
                        except Exception:
                            pass
    return None


class RealityFusionCrafter:
    """
    Handles "Reality Fusion Craft" image generation for AR textures.
    """

    def __init__(self):
        self.bucket_name = FUSION_BUCKET
        self.public_base_url = FUSION_PUBLIC_BASE_URL
        self._storage_client = None
        if storage is not None and self.bucket_name:
            try:
                self._storage_client = storage.Client()
            except Exception as exc:
                logger.warning("[RealityFusion] storage client init failed: %s", exc)

    async def _upload_to_gcs(self, image_bytes: bytes, concept_text: str) -> str:
        if not self._storage_client or not self.bucket_name:
            return ""

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        digest = hashlib.sha256(concept_text.encode("utf-8")).hexdigest()[:12]
        object_name = f"fused/{stamp}_{digest}.png"

        def _upload() -> str:
            bucket = self._storage_client.bucket(self.bucket_name)
            blob = bucket.blob(object_name)
            blob.upload_from_string(image_bytes, content_type="image/png")
            if self.public_base_url:
                return f"{self.public_base_url.rstrip('/')}/{object_name}"
            return f"https://storage.googleapis.com/{self.bucket_name}/{object_name}"

        return await asyncio.to_thread(_upload)

    async def _generate_image_bytes(self, client, reference_image: bytes, concept_text: str) -> bytes:
        prompt = (
            f"Use the reference image and generate a seamless AR robot armor texture themed '{concept_text}'. "
            "Output 1024x1024, metallic, game-ready texture map."
        )

        async def _run_generate_images():
            if genai_types is None or not hasattr(client.models, "generate_images"):
                raise RuntimeError("generate_images_unavailable")

            def _gen_images():
                return client.models.generate_images(
                    model=IMAGEN_MODEL,
                    prompt=prompt,
                    config=genai_types.GenerateImagesConfig(number_of_images=1),
                )

            response = await asyncio.to_thread(_gen_images)
            image_bytes = _extract_image_bytes(response)
            if not image_bytes:
                raise RuntimeError("no_image_bytes_in_generate_images")
            return image_bytes

        async def _run_generate_content_fallback():
            if genai_types is None:
                raise RuntimeError("genai_types_unavailable")

            contents = [
                genai_types.Part.from_bytes(reference_image, mime_type="image/jpeg"),
                genai_types.Part.from_text(prompt),
            ]

            def _gen_content():
                return client.models.generate_content(
                    model=IMAGEN_MODEL,
                    contents=contents,
                )

            response = await asyncio.to_thread(_gen_content)
            image_bytes = _extract_image_bytes(response)
            if not image_bytes:
                raise RuntimeError("no_image_bytes_in_generate_content")
            return image_bytes

        try:
            return await _retry_with_backoff("reality_fusion_generate_images", _run_generate_images)
        except Exception:
            return await _retry_with_backoff("reality_fusion_generate_content", _run_generate_content_fallback)

    async def generate_fused_item(self, reference_image: bytes, concept_text: str) -> str:
        """
        Generate and return a texture URL (preferred) or data URI fallback.
        """
        concept = (concept_text or "fusion").strip()[:120]
        logger.info("Generating fusion texture for concept=%s", concept)

        client = _get_genai_client()
        if client is None:
            _json_log({"event": "reality_fusion", "result": "mock", "reason": "genai_unavailable", "concept": concept})
            return f"https://plares-ar.storage/textures/fused_{hash(concept)}.png"

        try:
            image_bytes = await self._generate_image_bytes(client, reference_image, concept)
            gcs_url = await _retry_with_backoff(
                "reality_fusion_upload",
                lambda: self._upload_to_gcs(image_bytes, concept),
            )
            if gcs_url:
                _json_log({"event": "reality_fusion", "result": "success", "mode": "gcs", "concept": concept, "url": gcs_url})
                return gcs_url

            data_uri = "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
            _json_log({"event": "reality_fusion", "result": "success", "mode": "data_uri", "concept": concept})
            return data_uri
        except Exception as exc:
            _json_log({"event": "reality_fusion", "result": "error", "concept": concept, "error": str(exc)})
            logger.error("[RealityFusion] generation failed: %s", exc)
            return f"https://plares-ar.storage/textures/fused_{hash(concept)}.png"


class MilestoneVideoGenerator:
    """
    Pub/Sub publisher for background worker tasks (music/video generation).
    """

    def __init__(self, project_id: str = ""):
        self.project_id = project_id or GCP_PROJECT_ID
        self.victory_bgm_base_url = VICTORY_BGM_BASE_URL
        self._publisher = None
        if PUBSUB_ENABLED and pubsub_v1 is not None and self.project_id:
            try:
                self._publisher = pubsub_v1.PublisherClient()
            except Exception as exc:
                logger.warning("[MilestoneVideo] Pub/Sub client init failed: %s", exc)

    async def publish_message(self, topic: str, payload: dict[str, Any]) -> str | None:
        """Publish to Pub/Sub with retry; return message ID if published."""
        if not self._publisher or not self.project_id:
            _json_log({"event": "pubsub_mock", "topic": topic, "payload": payload})
            await asyncio.sleep(0.01)
            return None

        topic_path = self._publisher.topic_path(self.project_id, topic)
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        async def _publish_once():
            def _publish_blocking() -> str:
                future = self._publisher.publish(topic_path, data)
                return future.result(timeout=5)

            msg_id = await asyncio.to_thread(_publish_blocking)
            return msg_id

        try:
            msg_id = await _retry_with_backoff(f"pubsub_publish_{topic}", _publish_once)
            _json_log({"event": "pubsub_publish", "topic": topic, "msg_id": msg_id})
            return msg_id
        except Exception as exc:
            _json_log({"event": "pubsub_publish", "topic": topic, "result": "error", "error": str(exc)})
            logger.error("[Pub/Sub] Publish failed topic=%s error=%s", topic, exc)
            return None

    async def trigger_victory_music(self, user_id: str, ai_memory_summary: str) -> str | None:
        """
        Trigger victory music generation and return expected playback URL when available.
        """
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        track_name = f"victory_{user_id}_{stamp}.mp3"
        expected_url = (
            f"{self.victory_bgm_base_url.rstrip('/')}/{track_name}"
            if self.victory_bgm_base_url
            else None
        )

        client = _get_genai_client()
        if client is not None:
            async def _direct_music_call():
                prompt = (
                    "Generate a short victory soundtrack concept for an AR robot battle. "
                    f"Memory summary: {ai_memory_summary[:200]}"
                )

                def _gen_music():
                    return client.models.generate_content(
                        model=MUSIC_MODEL,
                        contents=prompt,
                    )

                await asyncio.to_thread(_gen_music)

            try:
                await _retry_with_backoff("victory_music_direct", _direct_music_call)
                _json_log({
                    "event": "lyria_music",
                    "result": "success",
                    "mode": "direct",
                    "user_id": user_id,
                    "track_name": track_name,
                    "url": expected_url,
                })
                return expected_url
            except Exception as exc:
                _json_log({
                    "event": "lyria_music",
                    "result": "error",
                    "mode": "direct",
                    "user_id": user_id,
                    "error": str(exc),
                })

        await self.publish_message(
            "lyria_music_generation_queue",
            {
                "userId": user_id,
                "memory": ai_memory_summary[:500],
                "trackName": track_name,
                "expectedUrl": expected_url,
            },
        )
        return expected_url

    async def check_and_generate_highlight_reel(self, total_matches: int, user_id: str):
        """
        Queue Veo highlight generation every 5 matches (non-blocking).
        """
        if total_matches % 5 == 0 and total_matches > 0:
            logger.info("Milestone reached user=%s matches=%s. Queueing highlight.", user_id, total_matches)
            await self.publish_message(
                "veo_video_generation_queue",
                {
                    "userId": user_id,
                    "totalMatches": total_matches,
                },
            )
        else:
            logger.debug("Skipping Veo generation user=%s matches=%s", user_id, total_matches)
