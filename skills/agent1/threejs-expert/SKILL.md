---
name: threejs-expert
description: Teaches the agent to produce high-performance Three.js and WebGL rendering code for the AR character and environments.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Three.js Expert

This skill guides the AI in handling 3D characters, shaders, particle systems, and structural bones using Three.js within an AR context.

## When to Use This Skill

- Whenever tasked with rendering 3D assets (`.gltf`, `.glb`) in the `/frontend/` directory.
- When creating visual effects (VFX) like explosions, lasers, or hit splatters.
- When manipulating a character's skeleton (bones) directly in code.

## Instructions

1. **Model Loading & Optimization**:
   - Preload models.
   - Ensure `glTF` models are decompressed properly using `KTX2Loader` and `DRACOLoader` if configured.
2. **Dynamic Bone Manipulation**:
   - Instead of creating entirely new models for leveled-up characters, manipulate `bone.scale.set(x,y,z)` inside the render loop based on player leveling or state changes.
3. **Custom Shaders**:
   - Write optimized GLSL shaders for material transitions (e.g., glowing auras or evolution pulses).
4. **Performance Rules**:
   - Limit draw calls by utilizing `InstancedMesh` for repeating objects like bullets or environmental debris.
   - Never block the main thread. If physics calculations are heavy, suggest offloading to a WebWorker or the backend.

## Examples

### Manipulating a Bone

```javascript
// Within the update loop
if (levelUpTriggered) {
  const armBone = model.getObjectByName("RightArmBone");
  if (armBone) {
    // Increase arm size to visualize physical strength upgrade
    armBone.scale.lerp(new THREE.Vector3(1.5, 1.5, 1.5), deltaTime * 2.0);
  }
}
```
