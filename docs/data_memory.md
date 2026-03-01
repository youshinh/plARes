# plARes: Data Structure & Memory Bank Integration

[日本語版 (JP)](jp/data_memory.md)

This document defines the data persistence, AI memory management (Memory Bank), and cost optimization logic for plARes.

---

## 1. Firestore Schema (Normalized)

Data is organized into a hierarchical structure to balance performance and scalability.

- **Root**: `users/{userId}` (Profile, Long-term memory summary)
- **Robots**: `users/{userId}/robots/{robotId}` (Stats, Material, Personality)
- **Logs**:
  - `matchLogs/{matchId}`
  - `trainingLogs/{trainingId}`
  - `walkLogs/{walkId}`

---

## 2. In-Memory State Management

To avoid massive Firestore R/W costs and latency, real-time battle data is handled in-memory.

- **Init**: Load memory summary and recent logs into the Gemini session at the start.
- **In-Battle**: Coordinates, damage, and spectator items are synced via P2P (WebRTC) and held in memory. **No Firestore writes during the match.**
- **Commit**: At the end of a session, Gemini extracts highlights. The logs are saved once, and the long-term memory summary is updated in a single write operation.

---

## 3. Context Caching

Large prompts (personality traits, physical rules, thousands of logs) are stored using **Vertex AI Context Caching**.

- **Result**: Reduces input token costs by up to 70% and speeds up TTFT (Time to First Token) for instant AI reactions.

---

## 4. Managed MCP servers for Firestore

The AI agent uses **Model Context Protocol (MCP)** to autonomously query Firestore.

- **Benefit**: The agent can proactively search for past context (e.g., "Master, this opponent is the one we lost to last month!") without manual API glue code.

---

> Refer to [AI Evolution](ai_evolution.md) for personality and stat details.
