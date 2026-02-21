---
name: bidi-streaming
description: Guides the implementation of Bidirectional (Bidi) Streaming pipelines. Use this when connecting the Gemini Live API to camera frames and raw audio input streams.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.1"
---

# Bidirectional Streaming Pipeline

This skill covers the Gemini Live API duplex flow for low-latency audio/video/text with tools.

## When to Use This Skill

- When designing `sendRealtimeInput` (upstream) and response handling (downstream).
- When implementing interruptions, manual activity signaling, and tool round-trips.
- When mapping browser capture (mic/camera) to Gemini Live sessions.
- Reference: `references/REFERENCE.md` and official docs:
  - https://ai.google.dev/gemini-api/docs/live
  - https://ai.google.dev/gemini-api/docs/live-guide
  - https://ai.google.dev/gemini-api/docs/live-tools
  - https://ai.google.dev/gemini-api/docs/live-session
  - https://ai.google.dev/gemini-api/docs/ephemeral-tokens

## Instructions

1. **Transport Selection**
   - Browser clients: prefer WebRTC + ephemeral token.
   - Server-to-server or trusted backend hops: WebSocket `BidiGenerateContent`.
2. **Upstream Media**
   - Audio input: 16-bit PCM, 16kHz, mono.
   - Video input: keep low FPS unless a feature truly needs higher cadence.
   - Use `sendRealtimeInput` for media chunks; do not overload `sendClientContent` for raw media.
3. **Turn and Activity Control**
   - With automatic activity detection (AAD) off, explicitly send `activityStart`, `activityEnd`, then `audioStreamEnd`.
   - Keep inbound and outbound loops concurrent (`asyncio.gather`) to avoid head-of-line blocking.
4. **Tool Calling**
   - Process `toolCall` in-stream and respond with `sendToolResponse`.
   - Do not pause media ingest while waiting for tool responses unless the tool itself requires gating.
5. **Interruption and Barge-in**
   - If user speech starts during model output, stop local playback quickly and signal the model with client content/activity events as appropriate.
6. **Session Resilience**
   - Persist session handles and support resume flow when reconnecting after transient drops (`goAway` or network churn).
7. **Security**
   - Never expose long-lived API keys in browser code. Use ephemeral tokens.

## Examples

### Duplex Loop Skeleton

```python
async def live_duplex_loop(session, media_queue):
    async def send_upstream():
        while True:
            chunk = await media_queue.get()
            await session.send_realtime_input(audio=chunk)

    async def read_downstream():
        async for event in session.receive():
            if event.tool_call:
                result = await execute_tool(event.tool_call)
                await session.send_tool_response(result)
            if event.server_content and event.server_content.output_transcription:
                await publish_caption(event.server_content.output_transcription)

    await asyncio.gather(send_upstream(), read_downstream())
```
