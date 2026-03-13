# plARes: Voice Judging & Latency Hiding

[日本語版 (JP)](jp/voice_latency.md)

This document defines the "Motion-First" asynchronous logic to hide AI inference and network lag (1-2s) and the judging logic using raw audio waves (Native Audio).

---

## 1. Latency Hiding: Motion-First Desgn

To prevent UX failure from lag, plARes decouples the UI from the communication pipeline.

### 1.1 Immediate Animation Start

The moment a player triggers a special move, the frontend immediately starts a **3-second "Charge Animation"** without waiting for an API response. This event is synced to the opponent via WebRTC Data Channel.

### 1.2 Parallel Streaming & JSON Callback

While the animation plays, voice data is streamed to the backend. The AI judge evaluates the voice and returns a JSON result (Critical or Miss) _before_ the animation ends. This ensures a seamless flow.

---

## 2. Native Audio Pipeline

plARes bypasses STT (Speech-to-Text) for judging.

- **Raw Wave Input**: Raw PCM audio (16kHz) is sent via WebRTC Audio Stream to the Gemini Live API.
- **Why?**: To capture "Passion" (volume, tremors, emotion) that text-based STT would lose.

---

## 3. Voice Judging Agent: 3-Axis Scoring

The agent evaluates the audio on a scale of 0.0 to 1.0:

1.  **Accuracy**: How well the player pronounced the difficult tongue-twister.
2.  **Speed**: Tempo and delivery speed.
3.  **Passion/Spirit**: Based on sound pressure and emotional intensity from the waveform.

---

## 4. Slip & Slide System (Comedy Penalty)

If the AI mishears a command (e.g., "Deep-fried spring roll" mispronounced as "Bald spring roll"), the **Comedy Agent** extracts the word:

- Generates a "Bald Spring Roll" 3D object using Imagen.
- Drops it into the arena as a physical hazard that damages the player.

---

> Refer to [Streaming Backend](streaming_backend.md) for bidirectional pipeline details.
