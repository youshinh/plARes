import { useEffect, useRef, useState } from 'react';
import { useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useArenaSyncStore } from '../store/useArenaSyncStore';

export type ScanState = 'idle' | 'searching' | 'tracking' | 'ready' | 'unsupported';

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage = 'Promise timed out'): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

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
const FALLBACK_ACTIVATE_NO_HIT_FRAMES = 8;
const FALLBACK_FORCE_FORWARD_NO_HIT_FRAMES = 20;
const SEARCHING_REASSERT_NO_HIT_FRAMES = 24;
const MIN_FALLBACK_DOWNWARD_DOT = -0.12;
const MAX_FALLBACK_DISTANCE_METERS = 6;
const MIN_SAMPLE_PUBLISH_INTERVAL_MS = 120;
const MIN_FALLBACK_FORWARD_DISTANCE_METERS = 0.9;
const MAX_FALLBACK_FORWARD_DISTANCE_METERS = 2.2;

const deriveFallbackFloorMatrix = (viewerPose: XRViewerPose): THREE.Matrix4 | null => {
  const position = viewerPose.transform.position;
  const orientation = viewerPose.transform.orientation;
  const cameraPos = new THREE.Vector3(position.x, position.y, position.z);
  const cameraQuat = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat);

  if (forward.y > MIN_FALLBACK_DOWNWARD_DOT) return null;
  const t = -cameraPos.y / forward.y;
  if (!Number.isFinite(t) || t <= 0 || t > MAX_FALLBACK_DISTANCE_METERS) return null;

  const point = cameraPos.clone().addScaledVector(forward, t);
  return new THREE.Matrix4().makeTranslation(point.x, point.y, point.z);
};

const deriveForwardApproxFloorMatrix = (viewerPose: XRViewerPose): THREE.Matrix4 => {
  const position = viewerPose.transform.position;
  const orientation = viewerPose.transform.orientation;
  const cameraPos = new THREE.Vector3(position.x, position.y, position.z);
  const cameraQuat = new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat);
  const forwardXZ = new THREE.Vector3(forward.x, 0, forward.z);
  if (forwardXZ.lengthSq() < 1e-6) {
    forwardXZ.set(0, 0, -1);
  } else {
    forwardXZ.normalize();
  }

  const forwardDistance = Math.min(
    MAX_FALLBACK_FORWARD_DISTANCE_METERS,
    Math.max(MIN_FALLBACK_FORWARD_DISTANCE_METERS, cameraPos.y * 0.85),
  );
  const point = cameraPos.clone().addScaledVector(forwardXZ, forwardDistance);
  point.y = 0;
  return new THREE.Matrix4().makeTranslation(point.x, point.y, point.z);
};

export const useWebXRScanner = () => {
  const { session } = useXR();
  const setLatestSample = useArenaSyncStore(s => s.setLatestSample);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const localSpaceRef    = useRef<XRReferenceSpace | null>(null); // for depth sensing
  const viewerSpaceRef   = useRef<XRReferenceSpace | null>(null); // for hit-test (spec requires viewer)
  const depthTextureRef = useRef<THREE.DataTexture | null>(null);
  const depthRawToMetersRef = useRef<number>(0.001);
  const depthTextureTypeRef = useRef<number>(THREE.UnsignedByteType);
  const depthUnsupportedRef = useRef(false);
  const lastPublishedSampleRef = useRef<{
    x: number;
    y: number;
    z: number;
    yaw: number;
    at: number;
  } | null>(null);
  const noHitFrameCountRef = useRef(0);
  const forceFallbackNotifiedRef = useRef(false);

  const [state, setState] = useState<XRScannerState>({
    isScanning: false,
    hoverMatrix: null,
    pointCloud: [],
    scanState: 'idle',
  });

  const lastVisionTriggerAtRef = useRef<number>(0);
  const lastDepthCheckAtRef = useRef<number>(0);

  // ── P2P NavMesh Receive ───────────────────────────────────────────────────
  useEffect(() => {
    const onP2P = (event: Event) => {
      const payload = (event as CustomEvent<any>).detail;
      if (payload?.type === 'navmesh') {
        console.log('[XR] Received remote navmesh data:', payload.data);
        window.dispatchEvent(
          new CustomEvent('remote_navmesh_ready', { detail: payload.data })
        );
      }
    };
    window.addEventListener('webrtc_payload', onP2P as EventListener);
    return () => window.removeEventListener('webrtc_payload', onP2P as EventListener);
  }, []);

  // ── Session Initialisation ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      hitTestSourceRef.current?.cancel();
      hitTestSourceRef.current = null;
      localSpaceRef.current = null;
      viewerSpaceRef.current = null;
      lastPublishedSampleRef.current = null;
      noHitFrameCountRef.current = 0;
      forceFallbackNotifiedRef.current = false;
      depthUnsupportedRef.current = false;
      depthTextureRef.current = null;
      depthRawToMetersRef.current = 0.001;
      setState({
        isScanning: false,
        hoverMatrix: null,
        pointCloud: [],
        scanState: 'idle',
      });
      return;
    }

    let cancelled = false;
    let hitSource: XRHitTestSource | null = null;
    let hasHitTestSource = false;

    const init = async () => {
      try {
        setState({
          isScanning: false,
          hoverMatrix: null,
          pointCloud: [],
          scanState: 'idle',
        });
        noHitFrameCountRef.current = 0;
        lastPublishedSampleRef.current = null;
        forceFallbackNotifiedRef.current = false;
        depthUnsupportedRef.current = false;
        depthTextureRef.current = null;
        depthRawToMetersRef.current = 0.001;

        // 'local-floor' gives y=0 at floor level; fall back to 'local'
        const localSpaceReq = session.requestReferenceSpace('local-floor')
          .catch(() => session.requestReferenceSpace('local'));
        const localSpace = await withTimeout(localSpaceReq, 5000, 'localSpace timeout');
        localSpaceRef.current = localSpace;

        // Hit-test MUST use 'viewer' space per WebXR spec.
        // Using 'local' was a bug that caused silent failure on ARCore devices.
        const viewerSpaceReq = session.requestReferenceSpace('viewer');
        const viewerSpace = await withTimeout(viewerSpaceReq, 5000, 'viewerSpace timeout').catch((err) => {
          console.warn('[XR] Viewer reference space unavailable or timed out, fallback scanner only:', err);
          return null;
        });
        viewerSpaceRef.current = viewerSpace;

        // requestHitTestSource is optional – guard against unsupported devices
        // (Desktop, iOS Safari which has no WebXR support at all)
        if (viewerSpace && typeof (session as any).requestHitTestSource === 'function') {
          try {
            const hitSourceReq = (session as any).requestHitTestSource({ space: viewerSpace });
            hitSource = await withTimeout(hitSourceReq, 5000, 'requestHitTestSource timeout');
            if (!cancelled) {
              hasHitTestSource = true;
              hitTestSourceRef.current = hitSource;
              console.log('[XR] Hit-test source acquired (viewer space)');
            }
          } catch (err) {
            console.warn('[XR] Hit-test source request failed or timed out, using fallback floor projection:', err);
          }
        } else {
          console.warn('[XR] Hit-test not supported on this device – fallback floor projection only');
        }

        if (!cancelled) {
          setState(s => ({ ...s, isScanning: true, scanState: 'searching' }));
          if (!hasHitTestSource) {
            window.dispatchEvent(new CustomEvent('show_subtitle', {
              detail: { text: '端末のAR平面検出が不安定です。床へ向けてゆっくり動かしてください。' }
            }));
          }
        }
      } catch (err) {
        console.error('[XR] Session init error:', err);
        if (!cancelled) {
          setState({
            isScanning: false,
            hoverMatrix: null,
            pointCloud: [],
            scanState: 'unsupported',
          });
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'お使いの端末はAR空間認識に対応していません。ロボットは平面上での動作になります。' }
          }));
        }
      }
    };

    const handleSessionEnd = () => {
      if (cancelled) return;
      hitSource?.cancel();
      hitTestSourceRef.current = null;
      localSpaceRef.current = null;
      viewerSpaceRef.current = null;
      lastPublishedSampleRef.current = null;
      noHitFrameCountRef.current = 0;
      forceFallbackNotifiedRef.current = false;
      depthUnsupportedRef.current = false;
      depthTextureRef.current = null;
      depthRawToMetersRef.current = 0.001;
      setState({
        isScanning: false,
        hoverMatrix: null,
        pointCloud: [],
        scanState: 'idle',
      });
    };

    session.addEventListener('end', handleSessionEnd);
    init();
    return () => {
      cancelled = true;
      session.removeEventListener('end', handleSessionEnd);
      hitSource?.cancel();
      hitTestSourceRef.current = null;
      localSpaceRef.current = null;
      viewerSpaceRef.current = null;
      noHitFrameCountRef.current = 0;
      forceFallbackNotifiedRef.current = false;
      depthUnsupportedRef.current = false;
      depthTextureRef.current = null;
      depthRawToMetersRef.current = 0.001;
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
    if (!viewerPose) return;
    const now = performance.now();
    const primaryView = viewerPose?.views[0];
    let viewerYaw = 0;
    if (primaryView) {
      const o = primaryView.transform.orientation;
      const q = new THREE.Quaternion(o.x, o.y, o.z, o.w);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      viewerYaw = Math.atan2(forward.x, forward.z);
    }

    const commitSurfacePose = (matrix: THREE.Matrix4) => {
      setState(prev => {
        const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
        // Deduplicate very close points (< 5 cm apart)
        const tooClose = prev.pointCloud.some(p => p.distanceTo(pos) < 0.05);
        const nextCloud = tooClose ? prev.pointCloud : [...prev.pointCloud, pos];

        // --- Environment Detection (Doc §2.2 Automation) ---
        if (now - lastVisionTriggerAtRef.current > 10000) { // 10s cooldown
          // Extract normal from matrix (column 1 is Y-axis in local space)
          const elements = matrix.elements;
          const normal = new THREE.Vector3(elements[4], elements[5], elements[6]).normalize();
          const up = new THREE.Vector3(0, 1, 0);
          const dot = normal.dot(up);

          if (dot < 0.85) { // ~31 degrees slope or uneven surface
            lastVisionTriggerAtRef.current = now;
            window.dispatchEvent(new CustomEvent('vision_trigger_detected', {
              detail: { trigger: 'uneven_surface', context: `slope_dot_${dot.toFixed(2)}` }
            }));
          }
        }

        // Trigger NavMesh rebuild once threshold is reached
        if (!tooClose && nextCloud.length === MIN_NAVMESH_POINTS) {
          console.log('[XR] Enough points for NavMesh build – dispatching navmesh_ready');
          window.dispatchEvent(
            new CustomEvent('navmesh_ready', { detail: nextCloud })
          );
        }

        const last = lastPublishedSampleRef.current;
        const movedEnough = !last || Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) > 0.03;
        const yawChangedEnough = !last || Math.abs(viewerYaw - last.yaw) > 0.05;
        const elapsedEnough = !last || (now - last.at) > MIN_SAMPLE_PUBLISH_INTERVAL_MS;
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

        return { ...prev, hoverMatrix: matrix, pointCloud: nextCloud, scanState: nextScanState };
      });
    };

    // ① Hit Test – record surface point
    let hasValidHit = false;
    if (hitTestSourceRef.current) {
      const results = frame.getHitTestResults(hitTestSourceRef.current);
      if (results.length > 0) {
        const pose = results[0].getPose(poseSpace);
        if (pose) {
          hasValidHit = true;
          noHitFrameCountRef.current = 0;
          commitSurfacePose(new THREE.Matrix4().fromArray(pose.transform.matrix));
        }
      }
    }
    if (!hasValidHit) {
      noHitFrameCountRef.current += 1;

      let fallbackMatrix: THREE.Matrix4 | null = null;
      if (noHitFrameCountRef.current >= FALLBACK_ACTIVATE_NO_HIT_FRAMES) {
        fallbackMatrix = deriveFallbackFloorMatrix(viewerPose);
      }

      if (!fallbackMatrix && noHitFrameCountRef.current >= FALLBACK_FORCE_FORWARD_NO_HIT_FRAMES) {
        fallbackMatrix = deriveForwardApproxFloorMatrix(viewerPose);
        if (!forceFallbackNotifiedRef.current) {
          forceFallbackNotifiedRef.current = true;
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'AR平面検出が不安定なため簡易推定モードで継続します。' }
          }));
        }
      }

      if (fallbackMatrix) {
        commitSurfacePose(fallbackMatrix);
      }

      if (noHitFrameCountRef.current >= SEARCHING_REASSERT_NO_HIT_FRAMES) {
        setState(prev => {
          if (prev.pointCloud.length > 0 || prev.scanState === 'searching') return prev;
          return {
            ...prev,
            hoverMatrix: null,
            scanState: 'searching',
          };
        });
      }
    }

    // ② Depth Sensing – upload depth map as DataTexture for occlusion shader
    if (!depthUnsupportedRef.current && typeof (frame as any).getDepthInformation === 'function') {
      if (viewerPose) {
        for (const view of viewerPose.views) {
          let depthInfo: XRDepthInformation | null = null;
          try {
            depthInfo = (frame as any).getDepthInformation(view);
          } catch (error) {
            const name = (error as any)?.name;
            if (name === 'NotSupportedError') {
              depthUnsupportedRef.current = true;
              depthTextureRef.current = null;
              depthRawToMetersRef.current = 0.001;
              console.warn('[XR] Depth sensing is unavailable in this AR session. Continuing without occlusion depth.');
              break;
            }
            throw error;
          }
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

            // --- Darkness Detection (Doc §2.2) ---
            if (now - lastDepthCheckAtRef.current > 5000) { // check every 5s
              lastDepthCheckAtRef.current = now;
              // Simple heuristic: if we have depth data, check a few samples for 'too dark' 
              // (In real WebXR this is hard with just depth, but we can simulate/trigger)
              const data = copiedData as any;
              let darkSamples = 0;
              for (let i = 0; i < 100; i++) {
                const idx = Math.floor(Math.random() * data.length);
                if (data[idx] === 0) darkSamples++; // 0 often means invalid/too close/too dark
              }
              if (darkSamples > 80 && now - lastVisionTriggerAtRef.current > 10000) {
                 lastVisionTriggerAtRef.current = now;
                 window.dispatchEvent(new CustomEvent('vision_trigger_detected', {
                   detail: { trigger: 'darkness', context: 'depth_data_missing' }
                 }));
              }
            }
          }
        }
      }
    }
  });

  // T1-4: Dispatch scanState changes for HTML overlay outside Canvas
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('scan_state_change', {
        detail: {
          scanState: state.scanState,
          pointCount: state.pointCloud.length,
          sessionActive: Boolean(session),
        },
      })
    );
  }, [session, state.scanState, state.pointCloud.length]);

  return {
    ...state,
    depthTexture: depthTextureRef.current,
    depthRawToMeters: depthRawToMetersRef.current,
  };
};
