---
name: artifacts-builder
description: Generates Server-Driven UI components and React code. Use this skill when building dynamic UI panels, tactical interfaces, or game HUD elements bound to JSON state.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Artifacts Builder (Server-Driven UI)

This skill guides the AI in creating dynamic, responsive React components driven by server-side JSON structures. It is primarily used for constructing the frontend interface for plARes.

## When to Use This Skill

- When you need to build UI overlays (e.g., HP bars, skill selections) on top of the 3D canvas.
- When creating React components that take a JSON payload from the backend as their single source of truth (`props`).
- When implementing UI animations intended to hide backend latency.

## Instructions

1. **Understand State Source**: Assume all state comes via WebSocket as JSON payloads (e.g., `{"action": "defend", "options": [...]}`). The client-side React should rely strictly on this state instead of managing business logic locally.
2. **Component Architecture**:
   - Keep components purely functional.
   - Use absolute minimum CSS-in-JS or utility classes (like Tailwind) for ultra-low overhead rendering.
3. **Latency Hiding UX**:
   - Provide immediate visual feedback _before_ the server confirmation arrives.
   - Example: On clicking "Attack", instantly play a CSS/SVG charge-up animation that lasts 2-3 seconds, bridging the gap while the backend AI calculates the result.
4. **AR Overlay Collision**:
   - Do not obscure the center of the screen where the AR robots battle.
   - Ensure UI panels have moderate opacity (`glassmorphism`) and sit at the edges of the device screen.

## Examples

### Input: JSON from Server

```json
{
  "panelType": "skill_select",
  "skills": [
    { "id": "s1", "name": "Fireball", "cooldown": 0 },
    { "id": "s2", "name": "Shield", "cooldown": 5 }
  ]
}
```

### Output Component:

```jsx
// React component responding to JSON
const TacticalPanel = ({ payload, onAction }) => {
  if (payload.panelType !== "skill_select") return null;

  return (
    <div className="absolute bottom-4 left-4 flex gap-2">
      {payload.skills.map((skill) => (
        <button
          key={skill.id}
          disabled={skill.cooldown > 0}
          onClick={() => onAction(skill.id)}
          className={`px-4 py-2 bg-black/50 text-white rounded border 
            ${skill.cooldown > 0 ? "opacity-50" : "hover:bg-red-500 transition-colors"}`}
        >
          {skill.name} {skill.cooldown > 0 && `(${skill.cooldown}s)`}
        </button>
      ))}
    </div>
  );
};
```
