---
name: adk-session-manager
description: Guides Agent 2 in setting up the Agent Development Kit (ADK) session lifecycle. Use when configuring initialization, run configurations, and runner loops for Gemini Live API.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.1"
---

# ADK Session Manager

This skill structures the backend ADK lifecycle with one isolated live session per client.

## When to Use This Skill

- When bootstrapping the main Python server entry point.
- When creating connection handlers for new socket clients.
- When mapping ADK session state to Gemini Live session resume strategy.
- Reference: `references/REFERENCE.md`.

## Instructions

1. **Application Init (Stateless)**:
   - Define one global `Agent` + `Runner` and keep model/tool config environment-driven.
2. **Session Init (Stateful)**:
   - On connect, get/create ADK session for that client.
   - Create a dedicated `LiveRequestQueue` per session (never global).
3. **Stream Execution**:
   - Run upstream and downstream tasks concurrently; route media via `send_realtime`.
   - Preserve tool-call round-trip behavior without stalling media ingest.
4. **Cleanup**:
   - On disconnect: close queue, cancel tasks, await task completion.
   - Persist resumption metadata where applicable so reconnect can continue context.
5. **Security Boundary**:
   - ADK backend can hold long-lived credentials.
   - Browser-facing live media should still use backend-minted ephemeral tokens.

## Examples

### ADK Lifecycle Boilerplate

```python
# 1. App Init
agent = Agent(name="PlaresBot", tools=[attack_tool], model="gemini-live-2.5-flash-preview")

async def on_client_connect(client_id, stream):
    # 2. Session Init
    session = await session_service.get_or_create(client_id)
    queue = LiveRequestQueue()

    # 3. Stream Execution
    run_task = asyncio.create_task(runner.run_live(session_id=client_id, live_request_queue=queue))

    # Wait for client disconnect (pseudo-code)
    await stream.wait_closed()

    # 4. Cleanup
    await queue.close()
    await run_task
```
