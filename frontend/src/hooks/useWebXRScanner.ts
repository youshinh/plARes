import { useEffect, useRef, useState } from 'react';
import { useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArenaSyncStore } from '../store/useArenaSyncStore';

export type ScanState = 'idle' | 'searching' | 'tracking' | 'ready' | 'unsupported';

interface XRScannerState {
  isScanning: boolean;
  hoverMatrix: THREE.Matrix4 | null; // latest hit-test pose
  pointCloud: THREE.Vector3[];       // aggregated surface points for NavMesh build
  scanState: ScanState;
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
  const setLatestSample = useArenaSyncStore(s => s.setLatestSample);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const localSpaceRef    = useRef<XRReferenceSpace | null>(null); // for depth sensing
  const viewerSpaceRef   = useRef<XRReferenceSpace | null>(null); // for hit-test (spec requires viewer)
  const depthTextureRef = useRef<THREE.DataTexture | null>(null);
  const depthRawToMetersRef = useRef<number>(0.001);
  const depthTextureTypeRef = useRef<number>(THREE.UnsignedByteType);
  const lastPublishedSampleRef = useRef<{
    x: number;
    y: number;
    z: number;
    yaw: number;
    at: number;
  } | null>(null);

  const [state, setState] = useState<XRScannerState>({
    isScanning: false,
    hoverMatrix: null,
    pointCloud: [],
    scanState: 'idle',
  });

  // ── Session Initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let hitSource: XRHitTestSource | null = null;

    const init = async () => {
      try {
        // 'local-floor' gives y=0 at floor level; fall back to 'local'
        const localSpace = await session.requestReferenceSpace('local-floor')
          .catch(() => session.requestReferenceSpace('local'));
        localSpaceRef.current = localSpace;

        // Hit-test MUST use 'viewer' space per WebXR spec.
        // Using 'local' was a bug that caused silent failure on ARCore devices.
        const viewerSpace = await session.requestReferenceSpace('viewer');
        viewerSpaceRef.current = viewerSpace;

        // requestHitTestSource is optional – guard against unsupported devices
        // (Desktop, iOS Safari which has no WebXR support at all)
        if (typeof (session as any).requestHitTestSource === 'function') {
          hitSource = await (session as any).requestHitTestSource({ space: viewerSpace });
          if (!cancelled) {
            hitTestSourceRef.current = hitSource;
            setState(s => ({ ...s, isScanning: true, scanState: 'searching' }));
            console.log('[XR] Hit-test source acquired (viewer space)');
          }
        } else {
          console.warn('[XR] Hit-test not supported on this device – NavMesh will not build');
          setState(s => ({ ...s, scanState: 'unsupported' }));
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'お使いの端末はAR空間認識に対応していません。ロボットは平面上での動作になります。' }
          }));
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
    if (!xrFrame || !session) return;
    const frame = xrFrame as XRFrame;
    // Use local-floor space for pose anchoring; viewer space is only for hit-test request
    const poseSpace = localSpaceRef.current;
    if (!poseSpace) return;
    const viewerPose = frame.getViewerPose(poseSpace);
    const primaryView = viewerPose?.views[0];
    let viewerYaw = 0;
    if (primaryView) {
      const o = primaryView.transform.orientation;
      const q = new THREE.Quaternion(o.x, o.y, o.z, o.w);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      viewerYaw = Math.atan2(forward.x, forward.z);
    }

    // ① Hit Test – record surface point
    if (hitTestSourceRef.current) {
      const results = frame.getHitTestResults(hitTestSourceRef.current);
      if (results.length > 0) {
        const pose = results[0].getPose(poseSpace);
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

            const now = performance.now();
            const last = lastPublishedSampleRef.current;
            const movedEnough = !last || Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) > 0.03;
            const yawChangedEnough = !last || Math.abs(viewerYaw - last.yaw) > 0.05;
            const elapsedEnough = !last || (now - last.at) > 120;
            if ((movedEnough || yawChangedEnough) && elapsedEnough) {
              setLatestSample({
                point: { x: pos.x, y: pos.y, z: pos.z },
                yaw: viewerYaw,
                scale: 1.0,
                timestamp: Date.now(),
                frameId: 'room_v1',
              });
              lastPublishedSampleRef.current = {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                yaw: viewerYaw,
                at: now,
              };
            }

            // Derive scanState from point cloud density
            const nextScanState: ScanState =
              nextCloud.length >= MIN_NAVMESH_POINTS
                ? 'ready'
                : 'tracking';

            return { ...prev, hoverMatrix: m, pointCloud: nextCloud, scanState: nextScanState };
          });
        }
      }
    }

    // ② Depth Sensing – upload depth map as DataTexture for occlusion shader
    if (typeof (frame as any).getDepthInformation === 'function') {
      if (viewerPose) {
        for (const view of viewerPose.views) {
          const depthInfo: XRDepthInformation | null = (frame as any).getDepthInformation(view);
          if (depthInfo && (depthInfo as any).data) {
            const d = depthInfo as any;
            const rawData = d.data as ArrayBufferView;
            const copiedData =
              rawData instanceof Uint16Array
                ? new Uint16Array(rawData)
                : rawData instanceof Float32Array
                  ? new Float32Array(rawData)
                  : rawData instanceof Uint8Array
                    ? new Uint8Array(rawData)
                    : new Uint8Array(rawData.buffer.slice(0));
            const textureType =
              rawData instanceof Uint16Array
                ? THREE.UnsignedShortType
                : rawData instanceof Float32Array
                  ? THREE.FloatType
                  : THREE.UnsignedByteType;
            if (
              !depthTextureRef.current ||
              depthTextureRef.current.image.width !== d.width ||
              depthTextureRef.current.image.height !== d.height ||
              depthTextureTypeRef.current !== textureType
            ) {
              depthTextureRef.current = new THREE.DataTexture(
                copiedData,
                d.width,
                d.height,
                THREE.RedFormat,
                textureType,
              );
              depthTextureRef.current.flipY = true;
              depthTextureRef.current.minFilter = THREE.NearestFilter;
              depthTextureRef.current.magFilter = THREE.NearestFilter;
              depthTextureRef.current.needsUpdate = true;
              depthTextureTypeRef.current = textureType;
            } else {
              // Reuse texture, just update data
              depthTextureRef.current.image.data = copiedData;
              depthTextureRef.current.needsUpdate = true;
            }
            const rawValueToMeters =
              typeof d.rawValueToMeters === 'number' && Number.isFinite(d.rawValueToMeters)
                ? d.rawValueToMeters
                : 0.001;
            const sampleToRawFactor =
              rawData instanceof Uint16Array
                ? 65535
                : rawData instanceof Uint8Array
                  ? 255
                  : 1;
            depthRawToMetersRef.current = rawValueToMeters * sampleToRawFactor;
          }
        }
      }
    }
  });

  // T1-4: Dispatch scanState changes for HTML overlay outside Canvas
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('scan_state_change', {
        detail: { scanState: state.scanState, pointCount: state.pointCloud.length },
      })
    );
  }, [state.scanState, state.pointCloud.length]);

  return {
    ...state,
    depthTexture: depthTextureRef.current,
    depthRawToMeters: depthRawToMetersRef.current,
  };
};
