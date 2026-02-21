---
name: adk-session-manager
description: Guides Agent 2 in setting up the Agent Development Kit (ADK) session lifecycle. Use when configuring initialization, run configurations, and runner loops for Gemini Live API.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# ADK Session Manager

This skill structures the backend AI lifecycle using an Agent Development Kit framework to keep state isolated per client.

## When to Use This Skill

- When bootstrapping the main Python server entry point.
- When creating connection handlers for new socket clients.
- **Reference**: For the latest ADK documentation on `LiveRequestQueue`, see `references/REFERENCE.md`.

## Instructions

1. **Application Init (Stateless)**:
   - Define the `Agent` (model name, global tools, base instructions) exactly once at global scope.
2. **Session Init (Stateful)**:
   - On client connect, retrieve or create a `SessionService` to hold that specific user's conversation history.
   - Initialize a `RunConfig` and create a dedicated `LiveRequestQueue`.
3. **Stream Execution**:
   - Execute the `Runner` in full-duplex mode inside an async task, passing the dedicated queue to it.
4. **Cleanup**:
   - Handle disconnections gracefully by sending a `close()` signal to the queue boundaries, allowing the `Runner` to finish cleanly.

## Examples

### ADK Lifecycle Boilerplate

```python
# 1. App Init
agent = Agent(name="PlaresBot", tools=[attack_tool])

async def on_client_connect(client_id, stream):
    # 2. Session Init
    session = await session_service.get_or_create(client_id)
    queue = LiveRequestQueue()

    # 3. Stream Execution
    runner = LiveRunner(agent, session)
    run_task = asyncio.create_task(runner.run(queue, stream))

    # Wait for client disconnect (pseudo-code)
    await stream.wait_closed()

    # 4. Cleanup
    await queue.close()
    await run_task
```
