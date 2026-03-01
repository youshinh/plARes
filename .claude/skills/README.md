# Claude Code Skills Directory

This directory (`.claude/skills` and `.claudecode/skills`) is reserved for Claude Code Skills.

## Active Skills

- `google-adk`: ADK implementation guidance aligned with PlaresAR model policy.
- `plares-e2e-testing`: Existing smoke-test execution and debugging flow.
- `plares-search-first`: Research-before-implementation workflow.
- `plares-contract-first-api`: Contract-first JSON/API/WebSocket design guardrails.
- `plares-verification-loop`: Quality-gate checklist before handoff or PR.
- `plares-e2e-ops`: PlaresAR E2E extension workflow (battle event checks).
- `plares-security-review`: Security checklist for tokens, MCP, WebRTC/WebSocket, and secrets.
- `plares-cost-gating`: Dynamic gating and model-routing policy for approved Gemini models.

## Imported and Adapted

The following skills were adapted on 2026-03-01 from:

- Repo: `https://github.com/affaan-m/everything-claude-code`
- Sources:
  - `skills/search-first`
  - `skills/api-design`
  - `skills/verification-loop`
  - `skills/e2e-testing`
  - `skills/security-review`
  - `skills/cost-aware-llm-pipeline`

All adapted skills are customized to PlaresAR constraints in `AGENTS.MD`,
`docs/architecture_live.md`, and `docs/15.プラレスAR：開発実行計画（タスク分解）.md`.
