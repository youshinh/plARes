---
name: fsm-architect
description: Guides Agent 1 in building the 3-Layer Priority State Machine. Use when implementing character states, behaviors, and the main game loop.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# 3-Layer Priority FSM Architect

This skill guides the implementation of the core game loop for the AR robot to ensure zero-latency responsiveness mixed with cloud-AI intelligence.

## When to Use This Skill

- When defining the character controller or main `update()` loop within the WebXR frame request.
- When integrating voice commands directly into local movement parameters.

## Instructions

1. **Define States**: Use enums (e.g., `HOVERING`, `BASIC_ATTACK`, `EMERGENCY_EVADE`).
2. **Implement Priority 1 (Local Voice)**:
   - Always evaluate this first.
   - If local Web Speech JS API detects an emergency command ("Dodge!", "Jump!"), apply physical impulse, set state to `EMERGENCY_EVADE`, and `return` (skip other layers).
3. **Implement Priority 2 (AI JSON)**:
   - Check the WebSocket queue for Gemini Function Calling outputs.
   - Overwrite the current target coordinate and state (e.g., `EVADE_TO_COVER`) if present.
4. **Implement Priority 3 (Local NavMesh)**:
   - If no Priority 1 or Priority 2 overrides exist, execute local pathfinding towards the current target.
   - This maintains constant, lag-free movement.

## Examples

### Update Loop Priority Structure

```javascript
function updateRobotState(deltaTime) {
  // Priority 1: Emergency Local Voice Command
  if (voiceInput.hasCommand("DODGE")) {
    state = State.EMERGENCY_EVADE;
    applyPhysicsImpulse(new Vector3(-10, 0, 0));
    voiceInput.clear();
    return; // Skip slower logic
  }

  // Priority 2: AI Cloud Command
  const aiCmd = aiQueue.pop();
  if (aiCmd) {
    if (aiCmd.action === "take_cover") {
      state = State.EVADE_TO_COVER;
      targetPosition = aiCmd.target_coords;
    }
  }

  // Priority 3: Normal Pathfinding
  if (state === State.HOVERING || state === State.EVADE_TO_COVER) {
    moveTowards(targetPosition, deltaTime);
  }
}
```
