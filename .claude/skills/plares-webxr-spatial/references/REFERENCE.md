# WebXR Device API Reference

Based on MDN Web Docs and the Immersive Web spec.

## WebXR Hit Test API

Calculates intersections between a 3D ray (e.g., the center of the user's screen) and the real-world geometry detected by the AR hardware.

### Setup

Must request the `hit-test` feature during session initialization:

```javascript
navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"] });
```

### Usage

1. Obtain an `XRHitTestSource` via `session.requestHitTestSource()`.
2. Retrieve the results per frame via `frame.getHitTestResults(hitTestSource)`.
3. Extract the `XRPose` from the result relative to the reference space to position the 3D model.

## WebXR Depth Sensing API

Provides real-time distance data from the camera to physical geometry, enabling realistic occlusion (hiding virtual objects behind real objects).

### Setup

Must request `depth-sensing` in the session init. Note: Always make this `optionalFeatures` as not all devices support it.

```javascript
navigator.xr.requestSession("immersive-ar", {
  requiredFeatures: ["hit-test"],
  optionalFeatures: ["depth-sensing"],
});
```

### Usage

- Retrieve depth information via `frame.getDepthInformation(view)`.
- Use `XRWebGLDepthInformation` for GPU-optimized depth mapping.
- Update the WebGL shader to discard fragments where the AR object's depth is greater than the real-world depth buffer reading.
