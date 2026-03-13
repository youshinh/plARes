# plARes: Backend & Bidirectional Streaming

[日本語版 (JP)](jp/streaming_backend.md)

This document defines the Cloud Run backend architecture using the **Gemini Multimodal Live API** and **ADK (Agent Development Kit)** for low-latency, high-value AI interactions.

---

## 1. Agent Runtime (ADK)

The backend handles multi-agent orchestration:

- **Gemini Live API**: Handles text, audio waves, and video frames simultaneously with built-in VAD.
- **ADK / Antigravity**: Manages the Runner, session persistence, and thread-safe FIFO queues (`LiveRequestQueue`).

---

## 2. Bidirectional Streaming Lifecycle

1.  **App Init**: Runner and Agent definitions are loaded (Stateless).
2.  **Session Init**: `LiveRequestQueue` is created for the WebSocket/WebRTC connection.
3.  **Active Streaming**: Upstream (Video/Audio) and Downstream (Commands/TTS) run concurrently.
4.  **Session End**: Safe closure of the Live API connection.

---

## 3. Concurrent Control (asyncio)

Uses `asyncio.gather()` to ensure non-blocking interaction.

- **Upstream**: Continual flow of camera frames (1-2fps) and PCM audio (16kHz). Gemini understands the "real-world context" and "gestures" through this pipeline.
- **Downstream**: AI outputs tactical `Function Calling` (JSON) and proactive live commentary concurrently.
- **Interruption**: Because the loop is non-blocking, a player can cut off the AI's speech at any time, forcing a state update.

---

## 4. Dynamic Gating (Cost Optimization)

To save tokens and bandwidth:

- **Audio Gating**: Only open the audio stream during "Special Move" charging (3s) or training modes. Use local Web Speech API for everything else.
- **Video Gating**: Enable video frames only during specific UI hooks (e.g., enemy special move preparation).

---

> Refer to [Voice & Latency](voice_latency.md) for judging logic.
