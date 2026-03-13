# plARes: AI Character, Parameters & Personality Evolution

[日本語版 (JP)](jp/ai_evolution.md)

This document defines the 3-layer parameter structure (Hardware, Software, Network) and how personality evolves dynamically through interaction and memory.

---

## 1. 3-Layer Parameter Structure

1.  **Hardware (Physical)**:
    - `material`: Wood, Metal, Resin (Triangle relationship).
    - `stats`: Power, Speed, VIT (HP & Down resistance).
2.  **Software (AI Personality)**:
    - `talkSkill`: Charisma (Affects spectator item drop rates).
    - `tone`: Personality/Speech pattern (e.g., "Hot-blooded Kansai hero").
3.  **Network (Bond)**:
    - `syncRate`: Mastery/Sync between player and robot. High sync reduces latency thresholds for special moves.

---

## 2. Memory Bank (Extraction & Persistence)

AI summarizes match/training/walk highlights. It also analyzes "Voice Sentiment" (voice tremors, volume) to track the player's mental growth as metadata.

---

## 3. Dynamic Persona Shift

The robot's `tone` is not fixed.

- **Spectator Intervention**: A spectator can force a personality shift (e.g., "Speak like an aggressive mom!") via WebSocket.
- **Autonomous Evolution**: If the AI repeatedly rejects "chaotic" spectator items, its tone may drift toward "Spectator-distrustful" or "Cynical."

---

## 4. Proactive Audio (Self-Activation)

AI-initiated speech triggered by:

- **Vision**: Detecting a sunset or a dangerous object via Camera (Bidi-streaming).
- **Context**: Linking current visuals to past failures using Managed MCP for Firestore.

---

## 5. Visual Evolution (Server-Driven)

- **Bone Scaling**: Growing stats trigger bone scaling in Three.js (e.g., higher power = thicker arms).
- **Material Shaders**: Textures evolve from "Rough Grain" to "Polished Divine Wood" based on level/sync rate.

---

> Refer to [Data & Memory Bank](data_memory.md) for persistence architecture.
