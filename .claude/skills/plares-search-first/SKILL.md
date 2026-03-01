---
name: plares-search-first
description: Research-before-implementation workflow for PlaresAR. Use before adding features, dependencies, or architecture changes.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/search-first
---

# PlaresAR Search-First

Use this skill before writing new code in `/frontend`, `/backend/ai_core`, `/backend/infrastructure`, or `/shared`.

## Workflow

1. Clarify scope
   - Identify target module (A/B/C/D) and owner directory.
   - Identify latency and cost constraints.
2. Read local source-of-truth first
   - `/AGENTS.MD`
   - `/docs/architecture_live.md`
   - `/docs/15.プラレスAR：開発実行計画（タスク分解）.md`
3. Query NotebookLM when specs are unclear
   - `nlm login`
   - `nlm query "46106b3a-80d5-4567-85c4-25dc3ee293cc" "<question>"`
   - Do not use `nlm chat start` (interactive REPL).
4. Search existing implementation before proposing new code
   - `rg "<keyword>" frontend backend shared`
   - Reuse existing helpers and patterns first.
5. Research official docs
   - Use Developer Knowledge MCP for Google/ADK/GCP APIs.
6. Decide
   - `Adopt`: existing solution fits.
   - `Extend`: existing solution + thin wrapper.
   - `Build`: only when no robust candidate exists.

## Output Template

Return a compact decision memo:

```md
Decision: Adopt | Extend | Build
Target: <directory/file>
Why: <latency/cost/maintainability reason>
Contract impact: <shared/types change or none>
Risk: <top 1-3 risks>
```

## PlaresAR Guardrails

- Contract-first: define/update JSON types in `/shared/types` before implementation.
- Respect directory ownership split (Agent 1/2/3 boundaries).
- Keep `/ws/game` for lightweight JSON events only.
- Update `/PROGRESS_SYNC.md` when starting/completing major tasks.
