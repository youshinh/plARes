---
name: dynamic-gating-controller
description: Guides Agent 2 in managing "Dynamic Gating" for the Live API to save token costs. Use when implementing logic to open or close audio/video streams based on game events.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Dynamic Gating Controller

This skill teaches the cost-saving architecture that prevents sending 24/7 continuous video and audio to Gemini, which is prohibitively expensive.

## When to Use This Skill

- When defining the middleware between the frontend WebRTC media stream and the backend Gemini API socket.
- When handling action triggers from the game loop.

## Instructions

1. **Audio Gating**:
   - Drop (ignore) incoming microphone audio packets during normal gameplay.
   - Rely on local Web Speech JS API output for basic commands.
   - Only write the incoming PCM packets to the `LiveRequestQueue` during special windows (e.g., a 3-second "Ultimate Move" charge window) to capture emotional voice data.
2. **Video Gating**:
   - Keep frame streaming OFF normally.
   - Only forward 1-2 fps video chunks when specific UI hooks flag the backend (e.g., `is_enemy_attacking == true` or `item_scanning_mode == true`).

## Examples

### Stream Gating Logic

```python
async def process_media_stream(packets, state_manager):
    async for packet in packets:
        # Video Gating
        if packet.is_video:
            if state_manager.is_scanning_mode():
                # Only 1 fps
                if packet.timestamp % 1.0 < 0.1:
                    await gemini_queue.put(packet)

        # Audio Gating
        if packet.is_audio:
            if state_manager.is_ultimate_charging():
                await gemini_queue.put(packet)
```
