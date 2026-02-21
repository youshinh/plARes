---
name: python-async-expert
description: Teaches expert-level Python `asyncio` patterns. Crucial for non-blocking subroutines and Antigravity ADK integration.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Python Async Expert

This skill ensures backend AI code is highly concurrent and never blocks the main event loop, which is critical for real-time game servers.

## When to Use This Skill

- When writing any I/O bound Python code (database access, API fetching, media stream routing).
- When integrating with the Agent Development Kit (ADK) event loops.

## Instructions

1. **Concurrency over Threading**:
   - Favor `asyncio.gather()` and `asyncio.create_task()` for running multiple operations concurrently (e.g., writing to Firestore while simultaneously streaming audio).
2. **Safe Buffer Management**:
   - When dealing with continuous streams, implement bounded queues (`asyncio.Queue(maxsize=X)`) and proper backpressure to prevent MemoryError crashes if the AI cannot process incoming visual frames fast enough.
3. **Graceful Shutdown**:
   - Ensure all pending tasks are tracked. Catch `asyncio.CancelledError`.
   - When a user's WebSocket/WebRTC session ends abruptly, iterate through active tasks and call `task.cancel()` to cleanly tear down the session memory.

## Examples

### Safe Task Management

```python
async def handle_client(websocket):
    tasks = set()
    try:
        task1 = asyncio.create_task(read_loop(websocket))
        task2 = asyncio.create_task(db_sync_loop())
        tasks.update({task1, task2})
        await asyncio.gather(task1, task2)
    except asyncio.CancelledError:
        print("Client disconnected, cleaning up...")
    finally:
        for t in tasks:
            t.cancel()
```
