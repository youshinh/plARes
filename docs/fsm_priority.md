# plARes: 3-Layer Priority FSM

[日本語版 (JP)](jp/fsm_priority.md)

This document defines the autonomous behavior logic running within the frontend rendering loop. It uses a 3-layer priority system to integrate "local reflexes" with "cloud strategic brains."

---

## 1. State Definitions

- `State.HOVERING`: Circling the enemy (default).
- `State.BASIC_ATTACK`: Moving in for a normal hit.
- `State.EVADE_TO_COVER`: AI-directed retreat behind a specific obstacle.
- `State.FLANKING_RIGHT`: AI-directed side maneuver.
- `State.EMERGENCY_EVADE`: Local player-directed emergency dodge.
- `State.CASTING_SPECIAL`: Charging a special move (3-second animation).

---

## 2. 3-Layer Priority Architecture

### Priority 1 (High): Local Voice Interruption

- **Trigger**: Local **Web Speech API**.
- **Logic**: Immediate physical impulse. Discards AI instructions for instant safety.
- **State**: `State.EMERGENCY_EVADE`.

### Priority 2 (Mid): AI Strategic Interruption

- **Trigger**: Gemini Live API `Function Calling` (JSON).
- **Logic**: Receives tactical goals (e.g., "Take cover behind Obstacle A"). Cancels normal loops to follow strategic orders.
- **State**: `State.EVADE_TO_COVER`, etc.

### Priority 3 (Low): Local Base Loop

- **Logic**: Autonomous pathfinding on the **NavMesh** toward current targets.
- **State**: `State.HOVERING`, `State.BASIC_ATTACK`.

---

## 3. Main Loop Evaluation

In every frame (`requestAnimationFrame`), the system evaluates layers in order: **P1 -> P2 -> P3**.

- If P1 is active, it overrides and returns immediately to skip P2/P3.
- If no P1, it checks the P2 command queue.
- If no P2, it proceeds with P3 pathfinding.

---

## 4. Conflict Resolution (Multiplayer)

1.  **P1 (Local Dodge)**: High authority. Applied immediately.
2.  **Network Sync Event**: Enemy hits/corrections.
3.  **P2 (AI Tactics)**: Mid authority.
4.  **P3 (Local Loop)**: Low authority.

**Rollback Window**: Dodge overrides damage if within a **50ms** window.

---

> Refer to [Spatial Awareness](spatial_awareness.md) for NavMesh details.
