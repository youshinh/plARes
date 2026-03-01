---
name: plares-e2e-ops
description: PlaresAR-specific E2E workflow based on live smoke script and battle-event validation.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/e2e-testing
---

# PlaresAR E2E Ops

Use this skill when validating frontend-backend integration.

## Primary Command

```bash
cd /Users/you/code/plaresAR
bash scripts/e2e_live_smoke.sh
```

## Required Artifacts

- `output/playwright/live-smoke/playwright.log`
- `output/playwright/live-smoke/backend.log`
- `output/playwright/live-smoke/frontend.log`

Always inspect logs before proposing fixes.

## Extension Checks (from docs/15)

Add/verify these checks in smoke scenarios:

1. `critical_hit` path is emitted and consumed.
2. `match_end` triggers `winner_interview`.
3. `bgm_ready` event is handled safely (no crash when URL is null).

## Stabilization Rules

- Prefer deterministic waits for explicit events over fixed sleep.
- Verify both success and fallback behavior.
- Keep one-command reproducibility for CI and local runs.

## Failure Triage Order

1. Backend startup / import errors
2. Token issuance and live connection
3. WebSocket event handling
4. Frontend render/state transition
