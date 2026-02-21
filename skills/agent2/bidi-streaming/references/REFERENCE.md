# Gemini Multimodal Live API Reference

This reference is based on the Google Cloud / AI Studio documentation for the Gemini Multimodal Live API (`BidiGenerateContent`).

## Capabilities

- **Multimodality**: Ingests audio, video, and text simultaneously via WebSockets.
- **Low-Latency**: Streams audio output back chunk-by-chunk.
- **Barge-in (Interruptions)**: Allows users to interrupt the AI's audio output. You must send a `client_content` message to flush the context and stop the current response.
- **Function Calling**: Streams JSON objects for tool execution mid-conversation without dropping the audio stream.

## Implementation Details

### API Endpoint

The connection is established over a WebSocket:
`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`

### Audio Format Constraints

- Input Audio: 16kHz, 16-bit PCM, single channel (mono).
- Output Audio: Same standard PCM format. The client must handle playback (e.g., using Web Audio API buffer nodes).

### Video Constraint

- Frame rate should be kept extremely low (1 fps) for cost savings unless continuous motion tracking is strictly necessary.

### Turn-Taking

Unlike traditional REST APIs, the client does not need to wait for a full response. Inputs are continuous. The server dictates when a "turn" is complete by sending a `turnComplete` signal in the JSON payload.
