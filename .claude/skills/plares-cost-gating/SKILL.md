---
name: plares-cost-gating
description: Cost-aware model routing and dynamic gating policy for PlaresAR Gemini workloads.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/cost-aware-llm-pipeline
---

# PlaresAR Cost Gating

Use this skill when implementing or reviewing AI calls.

## Approved Model Routing

- Deep strategy / long context: `gemini-3.1-pro-preview`
- Default backend inference: `gemini-3-flash-preview`
- High-volume lightweight tasks: `gemini-flash-lite-latest`
- Real-time native audio: `gemini-2.5-flash-native-audio-preview-12-2025`
- Non-streaming TTS: `gemini-2.5-flash-preview-tts`
- Image generation/editing: `gemini-3.1-flash-image-preview`

Never introduce unapproved Gemini model IDs.

## Dynamic Gating Rules

1. Keep heavy media streams off by default.
2. Open audio-intensive paths only during critical windows (for example, special move chant).
3. Keep baseline command handling local when possible (Web Speech/local FSM).
4. Batch expensive generation tasks via asynchronous milestone/event triggers.

## Cost and Latency Tracking

Log structured metrics per call:

```json
{
  "event": "llm_call",
  "model": "gemini-3-flash-preview",
  "path": "PathA",
  "purpose": "voice_judge",
  "latency_ms": 820
}
```

Track:

- call count by model
- p50/p95 latency
- cache hit/miss ratio
- retry rate and failure categories

## Retry Policy

- Retry transient failures only.
- Use bounded exponential backoff (1s, 2s, 4s).
- Fail fast on auth/configuration errors.

## Context Caching Policy

- Cache stable context (persona/rules/history) per session.
- Reuse cache ID on subsequent turns.
- Monitor cache hit ratio to validate TTFT improvements.
