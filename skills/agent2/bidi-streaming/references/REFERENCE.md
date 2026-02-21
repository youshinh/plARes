# Gemini Live API Reference (2026-02)

This file summarizes the official Gemini Live docs for implementation checks.

## Primary Documents

- https://ai.google.dev/gemini-api/docs/live
- https://ai.google.dev/gemini-api/docs/live-guide
- https://ai.google.dev/gemini-api/docs/live-tools
- https://ai.google.dev/gemini-api/docs/live-session
- https://ai.google.dev/gemini-api/docs/ephemeral-tokens
- https://ai.google.dev/gemini-api/docs/interactions

## Core Protocol Notes

1. **Connection Modes**
   - Backend/server use: WebSocket `BidiGenerateContent`.
   - Browser use: WebRTC with ephemeral token for security.
2. **Client Messages**
   - `sendRealtimeInput`: low-latency media chunks (audio/video).
   - `sendClientContent`: textual/turn-structured content updates.
   - `sendToolResponse`: return tool execution results for prior tool calls.
3. **Server Messages**
   - Tool events: `toolCall`, `toolCallCancellation`.
   - Generation state: `generationComplete`, `turnComplete`, `interrupted`.
   - Session state/control: setup completion, `goAway`, and resumption metadata.

## Media Requirements

- Audio input format: 16-bit PCM, 16kHz, mono.
- Video can be streamed, but low frame cadence is recommended for cost control.
- With AAD disabled, client must send explicit activity markers:
  - `activityStart`
  - `activityEnd`
  - `audioStreamEnd`

## Session Reliability

- Sessions can be resumed with a server-issued handle.
- Clients should store and rotate handle metadata and reconnect without losing context.
- `goAway` indicates the session should migrate/reconnect gracefully.

## Interaction API Alignment (Non-Live Fallback)

- If falling back to the Interactions API, chain turns with `previous_interaction_id`.
- `tools`, `system_instruction`, and `generation_config` are turn-scoped and must be re-sent each turn.
- Stored interaction history can be disabled with `store=false` when privacy requires it.

## Security and Credentials

- Do not embed long-lived API keys in browser clients.
- Mint ephemeral tokens on your backend and pass only short-lived credentials to browser/WebRTC clients.

## Suggested Model Defaults

- General low-latency/live interaction: `gemini-live-2.5-flash-preview`
- Lightweight text fallback: `gemini-flash-latest`
- Native audio-specialized workflows (when required): `gemini-2.5-flash-native-audio-preview-12-2025`
