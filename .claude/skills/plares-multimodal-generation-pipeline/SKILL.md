---
name: multimodal-generation-pipeline
description: Guides Agent 3 in orchestrating heavy AI generation APIs (Nano Banana Pro Image Fusion, Veo 3.1 Videos, Lyria Music).
license: MIT
metadata:
  author: plares-ar-team
  version: "1.1"
---

# Multimodal Generation Pipeline (Event-Driven)

This skill designs the non-blocking backend generation pipelines, preventing heavy ML generation tasks from locking up the fast-paced game server.

## When to Use This Skill

- When implementing features that generate images, music, or video arrays.
- When setting up Pub/Sub or background task workers (like Celery or Cloud Tasks).
- Reference:
  - https://ai.google.dev/gemini-api/docs/music-generation
  - https://ai.google.dev/gemini-api/docs/interactions

## Instructions

1. **8-Image Mix (Real-world Fusion)**:
   - When a player sends a photo of a real object, trigger Nano Banana Pro via an async task. Ensure the resulting 3D texture URL is pushed to the frontend via WebSocket within 1-2 seconds.
2. **Lyria Victory Music**:
   - On match win, analyze the `aiMemorySummary` and generate an instrumental prompt.
   - For near-real-time loops, use `lyria-realtime-exp`.
   - For non-realtime generation, use `lyria-002` or `lyria-002-multilingual`.
   - Keep output instrumental (no vocals) unless product requirements explicitly allow vocal synthesis.
   - Trigger music generation asynchronously and send the audio asset URL to the frontend for the victory screen.
3. **Veo 3.1 Milestone Videos (Batching)**:
   - Use Google Cloud Pub/Sub. When a player's `totalMatches % 5 === 0`, trigger a background worker.
   - Pass the last 5 match logs and frontend screenshots to Veo 3.1 to generate a vertical 9:16 highlight reel with AI commentary subtitles.
   - Email or push notify the user when the video is ready; NEVER make the client wait synchronously for video generation.

## Examples

### Asynchronous Event Trigger

```python
async def on_match_end(userId, match_data):
    # 1. Fast db update
    await update_firestore_memory_bank(userId, match_data)

    # 2. Fire and forget music generation
    asyncio.create_task(generate_victory_music(userId, match_data.highlight))

    # 3. Check for heavy milestone video batch
    user = await get_user(userId)
    if user.totalMatches % 5 == 0:
        await publish_to_pubsub(topic="veo_video_generation_queue", payload={"userId": userId})
```
