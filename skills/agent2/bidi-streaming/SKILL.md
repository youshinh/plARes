---
name: bidi-streaming
description: Guides the implementation of Bidirectional (Bidi) Streaming pipelines. Use this when connecting the Gemini Live API to camera frames and raw audio input streams.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Bidirectional Streaming Pipeline

This skill guides the AI in handling the complex asynchronous data flow of the Gemini Multimodal Live API via WebSockets.

## When to Use This Skill

- When designing the ingress/egress loops for continuous media.
- When handling user interruptions (where the user speaks over the AI).
- **Reference**: For the latest Gemini Multimodal Live API (`BidiGenerateContent`) specs, see `references/REFERENCE.md`.

## Instructions

1. **LiveRequestQueue Management**:
   - Maintain a thread-safe, non-blocking queue (`asyncio.Queue`) for incoming user media (audio chunks, video frames).
2. **Upstream (Input) Coroutines**:
   - Send video frames at a controlled, extremely low FPS (1-2 fps) to save multimodal tokens.
   - Send 16kHz PCM audio continuously or conditionally (gated).
3. **Downstream (Output) Coroutines**:
   - Handle incoming Native Audio chunks from Gemini's response and stream them to the WebRTC peer.
   - Handle incoming JSON Function Calling outputs without interrupting the concurrent audio stream.
4. **Interruption Handling**:
   - If User Voice Activity Detection triggers while the AI is responding (downstream active), immediately send a `client_content` message to flush the context, cancelling the current downstream task to achieve natural conversational turn-taking.

## Examples

### Coroutine Boilerplate

```python
async def bidi_streaming_loop(session, queue):
    # Upstream
    async def send_to_gemini():
        while True:
            chunk = await queue.get()
            await session.send(chunk)

    # Downstream
    async def receive_from_gemini():
        async for response in session.receive():
            if response.audio:
                await webrtc_send_audio(response.audio)
            elif response.function_call:
                await websocket_send_json(response.function_call)

    # Run concurrently without blocking
    await asyncio.gather(send_to_gemini(), receive_from_gemini())
```
