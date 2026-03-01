---
name: plares-contract-first-api
description: Contract-first JSON/API design guardrails for plARes WebSocket, WebRTC, and backend interfaces.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/api-design
---

# plARes Contract-First API

Use this skill when adding or changing:

- WebSocket events (`/ws/game`, `/ws/live`)
- Backend request/response payloads
- Firestore document shape used by agents
- Shared frontend/backend JSON contracts

## Mandatory Sequence

1. Update `/shared/types` first.
2. Update producer and consumer implementations.
3. Update tests and docs references.
4. Update `/PROGRESS_SYNC.md`.

## Required Event Envelope

```json
{
  "event": "critical_hit",
  "version": "1.0",
  "matchId": "m_123",
  "timestamp": "2026-03-01T10:00:00Z",
  "payload": {}
}
```

Minimum rules:

- `event`: stable snake_case identifier.
- `version`: increment on breaking schema changes.
- `payload`: language-agnostic JSON only.

## Path Separation Rules (Critical)

- `/ws/game`: JSON event sync only.
- `WebRTC Data Channel`: coordinate/action sync (10-30ms target).
- `WebRTC Media Stream` or Live path: audio/video streams.
- Never mix audio binary into `/ws/game`.

Reference: `/docs/architecture_live.md`.

## Error Contract

Use structured errors:

```json
{
  "error": {
    "code": "invalid_payload",
    "message": "Missing required field: matchId",
    "details": ["matchId is required"]
  }
}
```

## Review Checklist

- Schema in `/shared/types` exists and matches implementation.
- New events are backward-compatible or versioned.
- No language-dependent payload fields for core game state.
- Tests cover happy-path + malformed payload + missing field.
