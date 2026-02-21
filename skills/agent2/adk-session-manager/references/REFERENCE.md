# ADK Session Management & Bidi-Streaming Reference

This reference is based on the official Google Agent Development Kit (ADK) documentation.

## Core Concepts

The ADK uses a Bidirectional (Bidi) streaming architecture to manage low-latency, real-time voice and video interactions, primarily interacting with the Gemini Live API. It moves away from "ask-and-wait" REST patterns.

### LiveRequestQueue

The `LiveRequestQueue` is an `asyncio`-based queue that acts as the dedicated ingestion channel. Client applications push real-time data into it.

```python
# Conceptual Usage
from google_adk.components.live import LiveRequestQueue

queue = LiveRequestQueue()

# Sending text
await queue.send_content("Hello")

# Sending raw audio/video blobs
await queue.send_realtime(audio_frame)

# Cleanly closing the session queue
await queue.close()
```

### The Live Runner

The agent's asynchronous runner `run_live()` continuously pulls jobs/messages from the `LiveRequestQueue` and manages the LiveWebSocket connection.

## Best Practices

1. Keep the `LiveRequestQueue` scoped to the individual client session, not global.
2. Use `send_realtime` exclusively for streaming media chunks (PCM 16kHz audio, low-fps video frames).
3. Handle disconnection by intercepting client drops and explicitly calling `await queue.close()` and cancelling the runner task.
