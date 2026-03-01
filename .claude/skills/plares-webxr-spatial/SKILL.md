---
name: webxr-spatial
description: Assists Agent 1 in building spatial computing features using the WebXR Device API, including Depth Sensing and Hit Test API.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# WebXR Spatial Developer

Use this skill to implement AR spatial tracking, obstacle clipping (occlusion), and NavMesh generation on real-world surfaces.

## When to Use This Skill

- When writing the boot code to enter an immersive WebXR AR session.
- When placing AR anchors on real-world floors or tables.
- When implementing depth-based occlusion (making objects disappear behind real-world couches or cups).
- **Reference**: For the latest MDN specifications on WebXR Hit Test and Depth Sensing, see `references/REFERENCE.md`.

## Instructions

1. **Hit Testing**:
   - Establish anchors on the real-world floor or objects (like wooden craft stages) for the AR robots. Continually update a reticle until the user taps to place the robot.
2. **Depth Sensing (Occlusion)**:
   - Request `depth-sensing` in the required XR features.
   - Use `XRDepthInformation` to alter the fragment shader of the AR model, discarding pixels that are physically farther away than the depth map reading.
3. **NavMesh Generation**:
   - Accumulate point cloud/mesh data from Hit Test results over time to build a dynamic bounding box.
   - Transform physical world data into a local valid pathfinding graph for the unit.
4. **Graceful Degradation**:
   - If a device lacks `depth-sensing` support, fallback gracefully to basic Hit Test anchoring without camera-based occlusion.

## Examples

### Requesting the Session

```javascript
navigator.xr
  .requestSession("immersive-ar", {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["depth-sensing"],
  })
  .then((session) => {
    // session setup...
  });
```
