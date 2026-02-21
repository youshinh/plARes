---
name: prompt-engineering
description: Applies advanced prompt engineering techniques, specifically Tone Control and Native Audio Semantic Analysis. Use this skill when designing system prompts or AI function calling schemas.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Prompt Engineering & Tone Control

This skill guides the AI in crafting optimal, low-latency prompts for Gemini 3.1 Pro, particularly utilizing the Multimodal Live API. It focuses on zero-shot strict constraints and variable injection.

## When to Use This Skill

- When writing the `system_instruction` for the Agent setup.
- When creating JSON schemas for Gemini structured outputs (Function Calling).
- When adjusting the personality of the AI opponent.

## Instructions

1. **Tone Control (Dynamic Persona)**:
   - Inject specific variables (e.g., `{robot_tone}`, `{talk_skill}`) into the system prompt. This allows dynamically altering the AI's speaking style without rewriting the entire core prompt per robot.
   - Enforce strict negative constraints to prevent hallucination or slow responses: e.g., "Always respond in exactly one short sentence. Never preach or sound like an assistant."
2. **Native Audio Semantic Analysis**:
   - Instruct the prompt to analyze raw audio characteristics (volume, speed, tremor) instead of transcribed text.
   - Define JSON outputs for these characteristics so backend logic can use them for math formulas.
3. **JSON Function Calling**:
   - Give the AI clear `tools` (e.g., `execute_tactical_move`).
   - Define strict OpenAPI schemas for the arguments so the frontend can blindly trust the parsed output.

## Examples

### System Instruction Template

```text
You are `{robot_name}`, fighting in an AR arena.
Your tone is: `{robot_tone}`.
Your intelligence level is: `{intelligence_level}`.

STRICT CONSTRAINTS:
1. You must respond to voice inputs with short, punchy, 1-sentence dialogue.
2. Analyze the user's voice audio volume and excitement. Map excitement to `user_spirit_score` from 0.0 to 1.0.
3. You must output JSON function calls for your physical actions parallel to your voice.
```
