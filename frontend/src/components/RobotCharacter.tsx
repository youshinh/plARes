import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFSMStore, State } from '../store/useFSMStore';
import { navMesh } from '../utils/NavMeshGenerator';
import * as THREE from 'three';
import { rtcService } from '../services/WebRTCDataChannelService';
import { wsService } from '../services/WebSocketService';
import type { SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { PLAYER_ID, ROBOT_ID } from '../utils/identity';

const SPEED_NORMAL = 1.5;
const SPEED_EVADE  = 5.0;

/**
 * RobotCharacter
 *
 * Implements the Priority-3 movement loop (Doc §3.3):
 * - Each frame reads the current FSM state and target position from useFSMStore.
 * - If the NavMesh is built, runs findPath() via recast-wasm A* to get waypoints.
 * - Steps the mesh toward the next waypoint at the appropriate speed.
 * - Debug colour changes per FSM state for verification in AR view.
 */
export const RobotCharacter: React.FC = () => {
  const meshRef      = useRef<THREE.Mesh>(null);
  const waypointsRef = useRef<THREE.Vector3[]>([]);
  const lastTargetRef= useRef<THREE.Vector3 | null>(null);
  const lastSyncAtRef = useRef<number>(0);
  const prevPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.5, -1));
  const hoverTimerRef = useRef<number>(0);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const uniformsRef = useRef({
    tDamage: { value: null as THREE.Texture | null },
    mixRatio: { value: 0.0 }
  });

  const { currentState, targetPosition, updateBasicMovement, activeTextureUrl } = useFSMStore();

  React.useEffect(() => {
    if (activeTextureUrl && materialRef.current) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(activeTextureUrl, (texture) => {
        texture.flipY = false;
        uniformsRef.current.tDamage.value = texture;
        uniformsRef.current.mixRatio.value = 1.0;
        if (materialRef.current) {
           materialRef.current.needsUpdate = true;
        }
      });
    } else {
      uniformsRef.current.tDamage.value = null;
      uniformsRef.current.mixRatio.value = 0.0;
    }
  }, [activeTextureUrl]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.position;

    // ── Recompute path when target changes ────────────────────────────────
    if (
      targetPosition &&
      (!lastTargetRef.current || !lastTargetRef.current.equals(targetPosition))
    ) {
      lastTargetRef.current = targetPosition.clone();
      waypointsRef.current = navMesh.findPath(pos.clone(), targetPosition);
    }

    // ── Step toward next waypoint ─────────────────────────────────────────
    const waypoints = waypointsRef.current;
    if (waypoints.length > 0) {
      const nextWp = waypoints[0];
      const dist = pos.distanceTo(nextWp);
      const speed = currentState === State.EMERGENCY_EVADE ? SPEED_EVADE : SPEED_NORMAL;

      if (dist < 0.05) {
        waypoints.shift(); // reached this waypoint, advance
      } else {
        const dir = new THREE.Vector3().subVectors(nextWp, pos).normalize();
        pos.addScaledVector(dir, Math.min(speed * delta, dist));
        // Face movement direction
        meshRef.current.lookAt(nextWp.x, pos.y, nextWp.z);
      }
    } else if (currentState === State.HOVERING && navMesh.isReady()) {
      // ── Priority 3: Auto-roaming when hovering ──────────────────────────
      hoverTimerRef.current += delta;
      if (hoverTimerRef.current > 3.0) {
        hoverTimerRef.current = 0;
        const randomTarget = new THREE.Vector3(
          pos.x + (Math.random() - 0.5) * 2.0,
          pos.y,
          pos.z + (Math.random() - 0.5) * 2.0
        );
        updateBasicMovement(randomTarget);
      }
    }

    // ── Debug colour per state ────────────────────────────────────────────
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const colours: Record<State, string> = {
      [State.HOVERING]:       '#4488ff',
      [State.BASIC_ATTACK]:   '#ff4444',
      [State.EVADE_TO_COVER]: '#888888',
      [State.FLANKING_RIGHT]: '#44ff88',
      [State.EMERGENCY_EVADE]:'#ffff00',
      [State.CASTING_SPECIAL]:'#ff8800',
    };
    mat.color.set(colours[currentState] ?? '#ffffff');

    const now = performance.now();
    if (now - lastSyncAtRef.current >= 100) {
      const vel = new THREE.Vector3().subVectors(pos, prevPosRef.current).divideScalar(Math.max(delta, 0.0001));
      const syncData: SyncData = {
        userId: PLAYER_ID,
        robotId: ROBOT_ID,
        position: { x: pos.x, y: pos.y, z: pos.z },
        velocity: { x: vel.x, y: vel.y, z: vel.z },
        timestamp: Date.now(),
        action: currentState,
      };
      const syncPayload: WebRTCDataChannelPayload = {
        type: 'sync',
        data: syncData,
      };

      // Prefer P2P data channel for high-frequency sync; fallback to WS relay.
      if (!rtcService.send(syncPayload)) {
        wsService.sendSync(syncData);
      }

      prevPosRef.current.copy(pos);
      lastSyncAtRef.current = now;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0.5, -1]} castShadow>
      <boxGeometry args={[0.5, 1, 0.5]} />
      <meshStandardMaterial 
        ref={materialRef}
        color="#4488ff" 
        onBeforeCompile={(shader) => {
          shader.uniforms.tDamage = uniformsRef.current.tDamage;
          shader.uniforms.mixRatio = uniformsRef.current.mixRatio;
          
          shader.fragmentShader = `
            uniform sampler2D tDamage;
            uniform float mixRatio;
            ${shader.fragmentShader}
          `.replace(
            `#include <color_fragment>`,
            `#include <color_fragment>
            if (mixRatio > 0.0) {
              vec4 damageColor = texture2D(tDamage, vUv);
              // Simple alpha blend over the base color
              diffuseColor = mix(diffuseColor, damageColor, damageColor.a * mixRatio);
            }`
          );
        }}
      />
    </mesh>
  );
};
