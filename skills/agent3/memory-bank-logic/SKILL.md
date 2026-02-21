---
name: memory-bank-logic
description: Guides Agent 3 in implementing the "Commit & Summarize" Memory Bank pattern. Use when managing game state transitions to Firestore.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Memory Bank & State Management

This skill prevents API quota exhaustion by isolating fast game state from slow database state, leveraging AI summarization.

## When to Use This Skill

- When designing the end-of-match logic.
- When an AI agent needs to "remember" a past long-term event without reading thousands of log lines.

## Instructions

1. **In-Memory Streaming**:
   - During a match, keep all rapid events (damage taken, dodging, jumping) purely in Memory or Redis. Formulate this as an array of JSON objects.
2. **Commit & Summarize**:
   - At match end, send the entire 2-minute JSON event array to the Gemini text model with a prompt: "Extract the narrative highlights of this match in 3 sentences."
3. **Update Firestore**:
   - Write the resulting 3-sentence summary to `users/{id}/matchLogs/{matchId}`.
   - Pull the previous `aiMemorySummary` from the user profile, ask Gemini to merge it with the new highlight, and overwrite the user profile. This keeps the robot's "brain" compact but historically accurate.

## Examples

### Summarization Prompt Output

```json
{
  "matchId": "m_12345",
  "result": "WIN",
  "aiHighlight": "The robot narrowly dodged the Spring Roll attack and countered with a massive Laser Beam to secure the victory at the last second."
}
```
