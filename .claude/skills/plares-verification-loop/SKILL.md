---
name: plares-verification-loop
description: End-to-end verification gates for PlaresAR before handoff or PR.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/verification-loop
---

# PlaresAR Verification Loop

Run this after meaningful code changes.

## Phase 1: Frontend Build

```bash
cd frontend && npm run build
```

## Phase 2: Backend Syntax and Tests

```bash
cd /Users/you/code/plaresAR
python3 -m py_compile backend/ai_core/main.py backend/ai_core/streaming/bidi_session.py backend/infrastructure/*.py
PYTHONPATH=backend python3 -m pytest backend/tests -q
```

## Phase 3: Live Smoke E2E

```bash
cd /Users/you/code/plaresAR
bash scripts/e2e_live_smoke.sh
```

If failed, inspect:

- `output/playwright/live-smoke/playwright.log`
- `output/playwright/live-smoke/backend.log`
- `output/playwright/live-smoke/frontend.log`

## Phase 4: Architecture Guard Checks

1. Disallowed model strings:

```bash
rg -n "gemini-1\\.5|gemini-2\\.0|gemini-pro|gemini-live-2\\.5-flash-preview" backend frontend shared
```

2. Protocol misuse signals:

```bash
rg -n "/ws/game|audio|binary" backend frontend
```

Flag any code that sends audio over `/ws/game`.

## Phase 5: Diff and Progress Sync

```bash
git diff --stat
```

Confirm:

- Diff only touches intended files.
- `/PROGRESS_SYNC.md` is updated for major task completion.

## Report Format

```md
VERIFICATION REPORT
Build: PASS/FAIL
Backend tests: PASS/FAIL
E2E smoke: PASS/FAIL
Architecture guards: PASS/FAIL
Overall: READY/NOT READY
```
