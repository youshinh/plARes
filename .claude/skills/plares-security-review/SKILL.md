---
name: plares-security-review
description: Security checklist for PlaresAR covering secrets, transport boundaries, MCP safety, and input validation.
origin: adapted from https://github.com/affaan-m/everything-claude-code/tree/main/skills/security-review
---

# PlaresAR Security Review

Run this skill when changing auth, networking, MCP tools, or model-facing inputs.

## 1. Secrets and Tokens

- No hardcoded API keys or service-account secrets in code.
- Use env vars only.
- Browser clients must use ephemeral tokens, not long-lived API keys.

## 2. Transport Boundary Enforcement

- `/ws/game` carries JSON events only.
- Audio/video streams go through Live/WebRTC channels, never `/ws/game`.
- Check for accidental binary/audio payload routing.

## 3. MCP Tool Safety

- Enforce strict input schema validation for MCP tools.
- Prevent unrestricted Firestore scans.
- Avoid destructive tools by default; require explicit confirmation flow.

## 4. Input Validation

- Validate all external payloads (frontend events, API bodies, MCP args).
- Reject invalid/missing fields with structured errors.
- Do not pass raw user input directly to database queries.

## 5. Logging and Privacy

- Structured logs should avoid raw secrets and sensitive user content.
- Keep audit logs for tool invocation, cache operations, and major state changes.

## 6. Firestore Cost/Safety Guard

- Do not write high-frequency match state directly to Firestore.
- Keep in-match state in-memory; commit summarized logs post-match.

## Quick Audit Commands

```bash
cd /Users/you/code/plaresAR
rg -n "AIza|sk-|BEGIN PRIVATE KEY|service_account|api[_-]?key" backend frontend shared
rg -n "/ws/game|audio|binary|send.*bytes" backend frontend
```
