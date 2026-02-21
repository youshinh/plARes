import { useEffect, useRef, useState } from 'react';
import { useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface XRScannerState {
  isScanning: boolean;
  hoverMatrix: THREE.Matrix4 | null; // latest hit-test pose
  pointCloud: THREE.Vector3[];       // aggregated surface points for NavMesh build
}

/**
 * Real WebXR Space Recognition hook.
 *
 * Architecture (Doc §2):
 * - Requests XRSession with `hit-test` and `depth-sensing` optional features.
 * - Every frame: performs a centre-screen hit test and records the world-space
 *   hit point into a growing point cloud.
 * - The point cloud is exposed so NavMeshGenerator can consume it once enough
 *   coverage exists (>= MIN_POINTS threshold).
 * - Depth texture is fetched from XRDepthInformation and uploaded to a
 *   THREE.DataTexture for use in the occlusion shader.
 *
 * NOTE: `hit-test` and `depth-sensing` are optional features – the hook degrades
 * gracefully if the device doesn't support them (e.g. desktop preview mode).
 */

const MIN_NAVMESH_POINTS = 50; // trigger NavMesh rebuild once we have enough surface data

export const useWebXRScanner = () => {
  const { session } = useXR();
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const localSpaceRef = useRef<XRReferenceSpace | null>(null);
  const depthTextureRef = useRef<THREE.DataTexture | null>(null);

  const [state, setState] = useState<XRScannerState>({
    isScanning: false,
    hoverMatrix: null,
    pointCloud: [],
  });

  // ── Session Initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let hitSource: XRHitTestSource | null = null;

    const init = async () => {
      try {
        const refSpace = await session.requestReferenceSpace('local');
        localSpaceRef.current = refSpace;

        // requestHitTestSource is optional – guard against unsupported devices
        if (typeof (session as any).requestHitTestSource === 'function') {
          hitSource = await (session as any).requestHitTestSource({ space: refSpace });
          if (!cancelled) {
            hitTestSourceRef.current = hitSource;
            setState(s => ({ ...s, isScanning: true }));
            console.log('[XR] Hit-test source acquired');
          }
        } else {
          console.warn('[XR] Hit-test not supported on this device – AR preview only');
        }
      } catch (err) {
        console.error('[XR] Session init error:', err);
      }
    };

    init();
    return () => {
      cancelled = true;
      hitSource?.cancel();
      hitTestSourceRef.current = null;
    };
  }, [session]);

  // ── Per-frame Processing ────────────────────────────────────────────────────
  useFrame((_state, _delta, xrFrame) => {
    if (!xrFrame || !session || !localSpaceRef.current) return;
    const frame = xrFrame as XRFrame;

    // ① Hit Test – record surface point
    if (hitTestSourceRef.current) {
      const results = frame.getHitTestResults(hitTestSourceRef.current);
      if (results.length > 0) {
        const pose = results[0].getPose(localSpaceRef.current);
        if (pose) {
          const m = new THREE.Matrix4().fromArray(pose.transform.matrix);

          setState(prev => {
            const pos = new THREE.Vector3().setFromMatrixPosition(m);
            // Deduplicate very close points (< 5 cm apart)
            const tooClose = prev.pointCloud.some(p => p.distanceTo(pos) < 0.05);
            const nextCloud = tooClose ? prev.pointCloud : [...prev.pointCloud, pos];

            // Trigger NavMesh rebuild once threshold is reached
            if (!tooClose && nextCloud.length === MIN_NAVMESH_POINTS) {
              console.log('[XR] Enough points for NavMesh build – dispatching navmesh_ready');
              window.dispatchEvent(
                new CustomEvent('navmesh_ready', { detail: nextCloud })
              );
            }

            return { ...prev, hoverMatrix: m, pointCloud: nextCloud };
          });
        }
      }
    }

    // ② Depth Sensing – upload depth map as DataTexture for occlusion shader
    if (typeof (frame as any).getDepthInformation === 'function') {
      const viewerPose = frame.getViewerPose(localSpaceRef.current);
      if (viewerPose) {
        for (const view of viewerPose.views) {
          const depthInfo: XRDepthInformation | null = (frame as any).getDepthInformation(view);
          if (depthInfo && (depthInfo as any).data) {
            const d = depthInfo as any;
            if (!depthTextureRef.current) {
              depthTextureRef.current = new THREE.DataTexture(
                new Uint8Array(d.data.buffer),
                d.width,
                d.height,
                THREE.RedFormat
              );
            } else {
              // Reuse texture, just update data
              depthTextureRef.current.image.data = new Uint8Array(d.data.buffer);
              depthTextureRef.current.needsUpdate = true;
            }
          }
        }
      }
    }
  });

  return { ...state, depthTexture: depthTextureRef.current };
};
