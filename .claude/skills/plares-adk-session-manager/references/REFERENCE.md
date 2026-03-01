# ADK Session Management & Bidi Reference (2026-02)

## Core Concepts

ADK `Runner.run_live()` manages the duplex loop against Gemini Live while your app handles client I/O and queueing.

## Queue and Session Scope

- Use one `LiveRequestQueue` per connected user session.
- Keep session service keyed by stable IDs (`app_name`, `user_id`, `session_id`).
- Never share a media queue across clients.

## Conceptual Pattern

```python
from google.adk.agents import LiveRequestQueue

queue = LiveRequestQueue()
await queue.send_content("hello")
await queue.send_realtime(b"...pcm16...")
await queue.close()
```

## Runner Pattern

- Start client read-loop and `run_live` processing loop concurrently.
- Ensure both tasks stop cleanly on disconnect.
- Avoid starving downstream events while ingesting upstream media.

## Live API Alignment Checklist

1. Model is live-capable for this path (`gemini-live-2.5-flash-preview` family for live sessions).
2. Tool calls from downstream are surfaced and returned in-band.
3. Manual activity signals are supported when AAD is disabled.
4. Session resumption metadata is captured for reconnect scenarios.
5. Browser clients use ephemeral tokens and do not hold long-lived API keys.

## Interactions API Fallback Notes

- For non-live turns, preserve continuity with `previous_interaction_id`.
- Re-send `tools`, `system_instruction`, and generation config every turn (they are not implicitly carried).
- Use `store=false` for transient or privacy-sensitive flows.
