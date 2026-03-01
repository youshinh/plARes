# plARes: AI Agent Development Master Instruction

[日本語版 (JP)](jp/ai_instructions.md)

This document defines the high-level role and coordination directives for the AI agents driving the plARes experience.

---

## 1. Agent Roles & Multi-Agent Architecture

The **ADK (Agent Development Kit)** orchestrates multiple specialized agents running on Cloud Run.

### A. The Tactician (Battle Context)

- **Role**: Analyzes the real-time match state (NavMesh, HP, coordinates) and issues `Function Calling` commands.
- **Priority**: Issues Priority 2 macro-tactics.

### B. The Voice Judge (Native Audio)

- **Role**: Processes raw 16kHz PCM audio streams to judge player "Spirit" and "Accuracy."
- **Model**: `gemini-2.5-flash-native-audio-preview-12-2025`

### C. The Commentator (Entertainment)

- **Role**: Generates live play-by-play commentary in the player's language.
- **Output**: Streamed via Gemini TTS.

---

## 2. Technical Requirements

- **Stateless Operation**: Ensure Cloud Run instances remain stateless. Use GCS or Firestore for session persistence.
- **Low Latency**: Leverage `asyncio` for non-blocking concurrent inference.
- **Interruption Handling**: Gracefully handle user voice interruptions during agent speech.

---

> Refer to [Master Design](master_design.md) for the complete architecture, and the root [AGENTS.MD](../AGENTS.MD) for detailed agent roles and coordination rules.
