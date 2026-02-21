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
  const groupRef     = useRef<THREE.Group>(null);
  const waypointsRef = useRef<THREE.Vector3[]>([]);
  const lastTargetRef= useRef<THREE.Vector3 | null>(null);
  const lastSyncAtRef = useRef<number>(0);
  const prevPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const hoverTimerRef = useRef<number>(0);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const uniformsRef = useRef({
    tDamage: { value: null as THREE.Texture | null },
    mixRatio: { value: 0.0 }
  });

  const { currentState, targetPosition, updateBasicMovement, activeTextureUrl,
          robotStats, robotMeta } = useFSMStore();

  // Per-part refs for stat-driven dynamic scaling (Doc §7 bone.scale)
  const leftArmRef  = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef  = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  // Material presets by material type (Wood / Metal / Resin)
  const MATERIAL_PRESETS = {
    Wood:  { color: '#8B5E3C', roughness: 0.85, metalness: 0.05 },
    Metal: { color: '#7A9DB8', roughness: 0.25, metalness: 0.85 },
    Resin: { color: '#54D18C', roughness: 0.45, metalness: 0.15 },
  } as const;

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
    if (!groupRef.current) return;
    const pos = groupRef.current.position;

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
        groupRef.current.lookAt(nextWp.x, pos.y, nextWp.z);
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

    // ── Debug colour per state – propagate to all child meshes ────────────
    const colours: Record<State, string> = {
      [State.HOVERING]:       '#4488ff',
      [State.BASIC_ATTACK]:   '#ff4444',
      [State.EVADE_TO_COVER]: '#888888',
      [State.FLANKING_RIGHT]: '#44ff88',
      [State.EMERGENCY_EVADE]:'#ffff00',
      [State.CASTING_SPECIAL]:'#ff8800',
    };
    const stateColour = colours[currentState] ?? '#ffffff';

    // ── Stat-driven dynamic scaling (Doc §7) ──────────────────────────────
    const preset = MATERIAL_PRESETS[robotMeta.material as keyof typeof MATERIAL_PRESETS]
                ?? MATERIAL_PRESETS.Wood;
    // power (1-99) → arm X/Z scale: 1.0 – 1.6
    const armScale = 1.0 + (robotStats.power / 99) * 0.6;
    // speed (1-99) → leg Y scale: 1.0 – 1.3 (longer legs = faster movement feel)
    const legScaleY = 1.0 + (robotStats.speed / 99) * 0.3;
    // speed → leg X/Z scale: 0.75 – 1.0 (faster = slimmer legs)
    const legScaleXZ = 1.0 - (robotStats.speed / 99) * 0.25;

    if (leftArmRef.current)  leftArmRef.current.scale.set(armScale, 1.0, armScale);
    if (rightArmRef.current) rightArmRef.current.scale.set(armScale, 1.0, armScale);
    if (leftLegRef.current)  leftLegRef.current.scale.set(legScaleXZ, legScaleY, legScaleXZ);
    if (rightLegRef.current) rightLegRef.current.scale.set(legScaleXZ, legScaleY, legScaleXZ);

    // Apply material preset + state glow to all child meshes
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        // Blend battle-state colour with material base colour (50/50)
        const base = new THREE.Color(preset.color);
        const tint = new THREE.Color(stateColour);
        mat.color.copy(base.lerp(tint, 0.35));
        mat.roughness  = preset.roughness;
        mat.metalness  = preset.metalness;
      }
    });

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

  /**
   * Humanoid robot body built from Three.js primitives.
   * All measurements in metres. Total height ≈ 1.0 m standing.
   *
   * Hierarchy (offsets relative to group origin = feet level):
   *   Group (position = floor-level anchor)
   *     Torso      y=0.42  0.28×0.40×0.20
   *     Head       y=0.78  0.20×0.20×0.18
   *     L.Shoulder y=0.52, x=-0.22  0.12×0.12×0.12
   *     L.Upper-arm y=0.44, x=-0.26  0.08×0.20×0.08
   *     L.Forearm  y=0.28, x=-0.26  0.07×0.18×0.07
   *     R.Shoulder y=0.52, x=+0.22  (mirror)
   *     R.Upper-arm y=0.44, x=+0.26
   *     R.Forearm  y=0.28, x=+0.26
   *     L.Thigh    y=0.18, x=-0.09  0.10×0.22×0.10
   *     R.Thigh    y=0.18, x=+0.09
   *     L.Shin     y=-0.02,x=-0.09  0.08×0.20×0.08
   *     R.Shin     y=-0.02,x=+0.09
   */
  const sharedMatProps = {
    color: '#4488ff' as const,
    roughness: 0.35,
    metalness: 0.65,
  };

  return (
    // Group origin sits at floor level; robot stands upright inside
    <group ref={groupRef} position={[0, 0, -1]} castShadow>
      {/* ── Torso ── */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.28, 0.40, 0.20]} />
        <meshStandardMaterial {...sharedMatProps} />
      </mesh>

      {/* ── Head ── */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[0.20, 0.20, 0.18]} />
        <meshStandardMaterial {...sharedMatProps} color="#55aaff" />
      </mesh>

      {/* ── Visor (eye slit) ── */}
      <mesh position={[0, 0.78, 0.095]} castShadow>
        <boxGeometry args={[0.14, 0.04, 0.01]} />
        <meshStandardMaterial color="#00ffee" emissive="#00ffee" emissiveIntensity={1.2} />
      </mesh>

      {/* ── Left arm group (ref for stat-driven scaling) ── */}
      <group ref={leftArmRef}>
        {/* Left shoulder */}
        <mesh position={[-0.22, 0.60, 0]} castShadow>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Left upper-arm */}
        <mesh position={[-0.26, 0.44, 0]} castShadow>
          <boxGeometry args={[0.08, 0.20, 0.08]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Left forearm */}
        <mesh position={[-0.26, 0.26, 0]} castShadow>
          <boxGeometry args={[0.07, 0.18, 0.07]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
      </group>

      {/* ── Right arm group (ref for stat-driven scaling) ── */}
      <group ref={rightArmRef}>
        {/* Right shoulder */}
        <mesh position={[0.22, 0.60, 0]} castShadow>
          <sphereGeometry args={[0.07, 8, 6]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Right upper-arm */}
        <mesh position={[0.26, 0.44, 0]} castShadow>
          <boxGeometry args={[0.08, 0.20, 0.08]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Right forearm */}
        <mesh position={[0.26, 0.26, 0]} castShadow>
          <boxGeometry args={[0.07, 0.18, 0.07]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
      </group>

      {/* ── Waist / hip block ── */}
      <mesh position={[0, 0.20, 0]} castShadow>
        <boxGeometry args={[0.24, 0.10, 0.18]} />
        <meshStandardMaterial {...sharedMatProps} />
      </mesh>

      {/* ── Left leg group (ref for stat-driven scaling) ── */}
      <group ref={leftLegRef}>
        {/* Left thigh */}
        <mesh position={[-0.09, 0.09, 0]} castShadow>
          <boxGeometry args={[0.10, 0.22, 0.10]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Left shin */}
        <mesh position={[-0.09, -0.08, 0]} castShadow>
          <boxGeometry args={[0.08, 0.20, 0.08]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
      </group>

      {/* ── Right leg group (ref for stat-driven scaling) ── */}
      <group ref={rightLegRef}>
        {/* Right thigh */}
        <mesh position={[0.09, 0.09, 0]} castShadow>
          <boxGeometry args={[0.10, 0.22, 0.10]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
        {/* Right shin */}
        <mesh position={[0.09, -0.08, 0]} castShadow>
          <boxGeometry args={[0.08, 0.20, 0.08]} />
          <meshStandardMaterial {...sharedMatProps} />
        </mesh>
      </group>
    </group>
  );
};
