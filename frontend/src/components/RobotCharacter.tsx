import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFSMStore, State } from '../store/useFSMStore';
import { navMesh } from '../utils/NavMeshGenerator';
import * as THREE from 'three';
import { rtcService } from '../services/WebRTCDataChannelService';
import { wsService } from '../services/WebSocketService';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import type { SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { PLAYER_ID, ROBOT_ID } from '../utils/identity';
import {
  getFinishMaterialTuning,
  getSilhouetteScales,
  resolveRobotPalette,
} from '../utils/characterDNA';

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
          robotStats, robotMeta, robotDna } = useFSMStore();
  const silhouette = getSilhouetteScales(robotDna);
  const finishTuning = getFinishMaterialTuning(robotDna.finish);
  const dnaGlowIntensity = Math.max(0.9, Math.min(1.8, robotDna.glowIntensity || 1.0));
  const scarRoughnessBoost = (robotDna.scarLevel || 0) * 0.035;

  // Per-part refs for stat-driven dynamic scaling (Doc §7 bone.scale)
  const leftArmRef  = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef  = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

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

    // ── Stat-driven dynamic scaling (Doc §7) ──────────────────────────────
    // power (1-99) → arm X/Z scale: 1.0 – 1.6
    const armScale = (1.0 + (robotStats.power / 99) * 0.6) * silhouette.arm;
    // speed (1-99) → leg Y scale: 1.0 – 1.3 (longer legs = faster movement feel)
    const legScaleY = (1.0 + (robotStats.speed / 99) * 0.3) * silhouette.legY;
    // speed → leg X/Z scale: 0.75 – 1.0 (faster = slimmer legs)
    const legScaleXZ = (1.0 - (robotStats.speed / 99) * 0.25) * silhouette.legXZ;

    if (leftArmRef.current)  leftArmRef.current.scale.set(armScale, 1.0, armScale);
    if (rightArmRef.current) rightArmRef.current.scale.set(armScale, 1.0, armScale);
    if (leftLegRef.current)  leftLegRef.current.scale.set(legScaleXZ, legScaleY, legScaleXZ);
    if (rightLegRef.current) rightLegRef.current.scale.set(legScaleXZ, legScaleY, legScaleXZ);
    groupRef.current.scale.setScalar(silhouette.body);

    // Apply battle-state glow via emissive only – preserves each part's unique colour
    const emissiveMap: Record<State, string> = {
      [State.HOVERING]:        '#000000',  // no glow during idle
      [State.BASIC_ATTACK]:    '#661100',  // subtle red pulse
      [State.EVADE_TO_COVER]:  '#002244',  // blue cold flash
      [State.FLANKING_RIGHT]:  '#114422',  // green flash
      [State.EMERGENCY_EVADE]: '#444400',  // yellow warning
      [State.CASTING_SPECIAL]: '#441100',  // orange charge glow
    };
    const emissiveColor = emissiveMap[currentState] ?? '#000000';
    const emissiveIntensity = currentState === State.HOVERING ? 0.0 : 0.55;

    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        // Only touch emissive – leave visor glow controlled by DNA.
        if (mat.emissive && mat.emissiveIntensity < 1.2) {
          mat.emissive.set(emissiveColor);
          mat.emissiveIntensity = emissiveIntensity;
        }
        if (typeof mat.roughness === 'number') {
          const store = mat.userData as { baseRoughness?: number };
          if (typeof store.baseRoughness !== 'number') {
            store.baseRoughness = mat.roughness;
          }
          mat.roughness = Math.max(0.02, Math.min(0.98, store.baseRoughness + scarRoughnessBoost));
        }
      }
    });

    const now = performance.now();
    if (now - lastSyncAtRef.current >= 100) {
      const vel = new THREE.Vector3().subVectors(pos, prevPosRef.current).divideScalar(Math.max(delta, 0.0001));
      const frameId = useArenaSyncStore.getState().localCalibration?.frameId;
      const syncData: SyncData = {
        userId: PLAYER_ID,
        robotId: ROBOT_ID,
        position: { x: pos.x, y: pos.y, z: pos.z },
        velocity: { x: vel.x, y: vel.y, z: vel.z },
        timestamp: Date.now(),
        action: currentState,
        arenaFrameId: frameId,
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

  // ─── Colour palette (Plaresto style) ────────────────────────────────────
  const C = resolveRobotPalette(robotMeta.material, robotDna);
  const tuneRough = (value: number) => Math.max(0.02, Math.min(0.98, value + finishTuning.roughnessBias));
  const tuneMetal = (value: number) => Math.max(0.0, Math.min(1.0, value + finishTuning.metalBias));

  // ─── Material factory helpers ────────────────────────────────────────────
  const M = {
    white:  (r=0.30, m=0.25) => <meshStandardMaterial color={C.white}  roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    whiteB: (r=0.40, m=0.20) => <meshStandardMaterial color={C.whiteB} roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    blue:   (r=0.35, m=0.55) => <meshStandardMaterial color={C.blue}   roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    blueL:  (r=0.40, m=0.45) => <meshStandardMaterial color={C.blueL}  roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    red:    (r=0.35, m=0.40) => <meshStandardMaterial color={C.red}    roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    redD:   (r=0.45, m=0.35) => <meshStandardMaterial color={C.redD}   roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    yellow: (r=0.30, m=0.30) => <meshStandardMaterial color={C.yellow} roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    black:  (r=0.50, m=0.60) => <meshStandardMaterial color={C.black}  roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    blackM: (r=0.60, m=0.40) => <meshStandardMaterial color={C.blackM} roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    skin:   ()               => <meshStandardMaterial color={C.skin}   roughness={tuneRough(0.80)} metalness={0.00} />,
    silver: (r=0.25, m=0.70) => <meshStandardMaterial color={C.silver} roughness={tuneRough(r)} metalness={tuneMetal(m)} />,
    panel:  ()               => <meshStandardMaterial color={C.panel}  roughness={tuneRough(0.50)} metalness={tuneMetal(0.20)} />,
    visor:  ()               => <meshStandardMaterial color={C.cyan}   emissive={C.cyan} emissiveIntensity={dnaGlowIntensity} roughness={tuneRough(0.05)} metalness={tuneMetal(0.90)} />,
  } as const;

  // ── Derive visual scales from stats ──────────────────────────────────────
  const armScale = (1.0 + (robotStats.power / 99) * 0.55) * silhouette.arm;
  const legScaleY  = (1.0 + (robotStats.speed / 99) * 0.28) * silhouette.legY;
  const legScaleXZ = (1.0 - (robotStats.speed / 99) * 0.18) * silhouette.legXZ;

  return (
    <group ref={groupRef} position={[0, 0, -1]} scale={[silhouette.body, silhouette.body, silhouette.body]} castShadow>

      {/* ════════════════════════════════════════════════════════════════════
          HEAD — helmet dome + face + visor + forehead marker
          Total head center: y = 0.85
      ════════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.85, 0]}>
        {/* Helmet – main dome (slightly flattened sphere) */}
        <mesh castShadow scale={[1.0, 1.05, 0.92]}>
          <sphereGeometry args={[0.118, 16, 14]} />
          {M.white()}
        </mesh>

        {/* Helmet rear extension */}
        <mesh position={[0, 0.01, -0.04]} castShadow>
          <boxGeometry args={[0.20, 0.16, 0.08]} />
          {M.white()}
        </mesh>

        {/* Face plate – skin tone oval */}
        <mesh position={[0, -0.01, 0.08]} castShadow scale={[0.92, 1.0, 1.0]}>
          <sphereGeometry args={[0.082, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          {M.skin()}
        </mesh>

        {/* Forehead D-marker */}
        <mesh position={[0, 0.075, 0.105]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.008, 8]} />
          {M.red()}
        </mesh>

        {/* Left eye */}
        <mesh position={[-0.035, 0.010, 0.108]} castShadow>
          <boxGeometry args={[0.038, 0.018, 0.008]} />
          {M.visor()}
        </mesh>
        {/* Right eye */}
        <mesh position={[0.035, 0.010, 0.108]} castShadow>
          <boxGeometry args={[0.038, 0.018, 0.008]} />
          {M.visor()}
        </mesh>

        {/* Chin guard */}
        <mesh position={[0, -0.072, 0.065]} castShadow>
          <boxGeometry args={[0.11, 0.032, 0.06]} />
          {M.white()}
        </mesh>

        {/* Cheek pads left */}
        <mesh position={[-0.095, -0.01, 0.035]} castShadow>
          <boxGeometry args={[0.028, 0.09, 0.07]} />
          {M.white()}
        </mesh>
        {/* Cheek pads right */}
        <mesh position={[0.095, -0.01, 0.035]} castShadow>
          <boxGeometry args={[0.028, 0.09, 0.07]} />
          {M.white()}
        </mesh>

        {/* Neck */}
        <mesh position={[0, -0.120, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.050, 0.06, 10]} />
          {M.skin()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          TORSO — wide white chest + panel lines + upper abs
          y center = 0.53
      ════════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.53, 0]}>
        {/* Main chest block – wide, subtly tapered */}
        <mesh castShadow scale={[1.0, 1.0, 0.75]}>
          <boxGeometry args={[0.320, 0.240, 0.200]} />
          {M.white()}
        </mesh>

        {/* Upper chest bevel (rounded top edge) */}
        <mesh position={[0, 0.105, 0.018]} castShadow>
          <boxGeometry args={[0.300, 0.025, 0.155]} />
          {M.whiteB()}
        </mesh>

        {/* Chest panel – left recess */}
        <mesh position={[-0.078, 0.010, 0.078]} castShadow>
          <boxGeometry args={[0.080, 0.120, 0.008]} />
          {M.panel()}
        </mesh>
        {/* Chest panel – right recess */}
        <mesh position={[0.078, 0.010, 0.078]} castShadow>
          <boxGeometry args={[0.080, 0.120, 0.008]} />
          {M.panel()}
        </mesh>

        {/* Sternum detail strip */}
        <mesh position={[0, 0.025, 0.080]} castShadow>
          <boxGeometry args={[0.030, 0.130, 0.006]} />
          {M.silver()}
        </mesh>

        {/* Status indicators (tri-colour badges) */}
        <mesh position={[-0.020, 0.072, 0.081]} castShadow>
          <boxGeometry args={[0.014, 0.012, 0.005]} />
          <meshStandardMaterial color="#4488FF" emissive="#4488FF" emissiveIntensity={1.0} />
        </mesh>
        <mesh position={[0.001, 0.072, 0.081]} castShadow>
          <boxGeometry args={[0.014, 0.012, 0.005]} />
          <meshStandardMaterial color="#FFCC00" emissive="#FFCC00" emissiveIntensity={1.0} />
        </mesh>
        <mesh position={[0.022, 0.072, 0.081]} castShadow>
          <boxGeometry args={[0.014, 0.012, 0.005]} />
          <meshStandardMaterial color="#FF3333" emissive="#FF3333" emissiveIntensity={1.0} />
        </mesh>

        {/* Upper abs – skin-coloured transition strip */}
        <mesh position={[0, -0.115, 0.060]} castShadow>
          <boxGeometry args={[0.220, 0.025, 0.120]} />
          {M.skin()}
        </mesh>

        {/* Spine back detail */}
        <mesh position={[0, 0, -0.082]} castShadow>
          <boxGeometry args={[0.050, 0.200, 0.012]} />
          {M.silver()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          WAIST + CORE — red core unit, black band, hip joint
          y center = 0.35
      ════════════════════════════════════════════════════════════════════ */}
      <group position={[0, 0.355, 0]}>
        {/* Black waist band */}
        <mesh castShadow>
          <boxGeometry args={[0.280, 0.060, 0.175]} />
          {M.black()}
        </mesh>

        {/* Red core unit front */}
        <mesh position={[0, 0, 0.082]} castShadow>
          <boxGeometry args={[0.120, 0.060, 0.020]} />
          {M.red()}
        </mesh>

        {/* Core detail inside red unit */}
        <mesh position={[0, 0, 0.094]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.015, 10]} />
          {M.blackM()}
        </mesh>

        {/* Hip flap left */}
        <mesh position={[-0.155, -0.010, 0]} castShadow rotation={[0, 0, 0.08]}>
          <boxGeometry args={[0.040, 0.072, 0.150]} />
          {M.blue()}
        </mesh>
        {/* Hip flap right */}
        <mesh position={[0.155, -0.010, 0]} castShadow rotation={[0, 0, -0.08]}>
          <boxGeometry args={[0.040, 0.072, 0.150]} />
          {M.blue()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          LEFT ARM  (ref for power scaling)
          Shoulder  x=-0.230  Pauldron disc at y=0.655
          Upper-arm x=-0.270  y=0.530
          Elbow     x=-0.270  y=0.430
          Forearm   x=-0.270  y=0.330
          Wrist     x=-0.270  y=0.235
          Hand      x=-0.270  y=0.188
      ════════════════════════════════════════════════════════════════════ */}
      <group ref={leftArmRef} scale={[armScale, 1.0, armScale]}>
        {/* Shoulder ball joint */}
        <mesh position={[-0.190, 0.640, 0]} castShadow>
          <sphereGeometry args={[0.055, 10, 8]} />
          {M.white()}
        </mesh>

        {/* Pauldron – large round shoulder guard (main disc) */}
        <mesh position={[-0.240, 0.655, 0]} castShadow rotation={[0, 0, -0.12]}>
          <cylinderGeometry args={[0.092, 0.082, 0.055, 14, 1, false]} />
          {M.white()}
        </mesh>
        {/* Pauldron rim detail */}
        <mesh position={[-0.240, 0.630, 0]} castShadow rotation={[0, 0, -0.12]}>
          <cylinderGeometry args={[0.086, 0.092, 0.012, 14]} />
          {M.whiteB()}
        </mesh>
        {/* Pauldron bolt screw left */}
        <mesh position={[-0.255, 0.660, 0.060]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 0.012, 6]} />
          {M.silver()}
        </mesh>
        {/* Pauldron bolt screw right */}
        <mesh position={[-0.255, 0.660, -0.060]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 0.012, 6]} />
          {M.silver()}
        </mesh>

        {/* Upper arm – white */}
        <mesh position={[-0.265, 0.530, 0]} castShadow>
          <boxGeometry args={[0.078, 0.180, 0.078]} />
          {M.white()}
        </mesh>

        {/* Yellow wrist band */}
        <mesh position={[-0.265, 0.410, 0]} castShadow>
          <boxGeometry args={[0.085, 0.028, 0.085]} />
          {M.yellow()}
        </mesh>

        {/* Forearm – black */}
        <mesh position={[-0.265, 0.325, 0]} castShadow>
          <boxGeometry args={[0.072, 0.165, 0.072]} />
          {M.black()}
        </mesh>
        {/* Forearm highlight stripe */}
        <mesh position={[-0.228, 0.325, 0.028]} castShadow>
          <boxGeometry args={[0.008, 0.150, 0.008]} />
          {M.silver()}
        </mesh>

        {/* Wrist/hand skin */}
        <mesh position={[-0.265, 0.228, 0]} castShadow>
          <boxGeometry args={[0.060, 0.055, 0.060]} />
          {M.skin()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          RIGHT ARM (mirror of left)
      ════════════════════════════════════════════════════════════════════ */}
      <group ref={rightArmRef} scale={[armScale, 1.0, armScale]}>
        {/* Shoulder ball */}
        <mesh position={[0.190, 0.640, 0]} castShadow>
          <sphereGeometry args={[0.055, 10, 8]} />
          {M.white()}
        </mesh>

        {/* Pauldron */}
        <mesh position={[0.240, 0.655, 0]} castShadow rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.092, 0.082, 0.055, 14, 1, false]} />
          {M.white()}
        </mesh>
        <mesh position={[0.240, 0.630, 0]} castShadow rotation={[0, 0, 0.12]}>
          <cylinderGeometry args={[0.086, 0.092, 0.012, 14]} />
          {M.whiteB()}
        </mesh>
        <mesh position={[0.255, 0.660, 0.060]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 0.012, 6]} />
          {M.silver()}
        </mesh>
        <mesh position={[0.255, 0.660, -0.060]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 0.012, 6]} />
          {M.silver()}
        </mesh>

        {/* Upper arm */}
        <mesh position={[0.265, 0.530, 0]} castShadow>
          <boxGeometry args={[0.078, 0.180, 0.078]} />
          {M.white()}
        </mesh>

        {/* Yellow wrist band */}
        <mesh position={[0.265, 0.410, 0]} castShadow>
          <boxGeometry args={[0.085, 0.028, 0.085]} />
          {M.yellow()}
        </mesh>

        {/* Black forearm */}
        <mesh position={[0.265, 0.325, 0]} castShadow>
          <boxGeometry args={[0.072, 0.165, 0.072]} />
          {M.black()}
        </mesh>
        <mesh position={[0.228, 0.325, 0.028]} castShadow>
          <boxGeometry args={[0.008, 0.150, 0.008]} />
          {M.silver()}
        </mesh>

        {/* Hand skin */}
        <mesh position={[0.265, 0.228, 0]} castShadow>
          <boxGeometry args={[0.060, 0.055, 0.060]} />
          {M.skin()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          LEFT LEG (ref for speed scaling)
          Hip sphere y=0.295  x=-0.100
          Thigh      y=0.215  x=-0.100   Blue
          Knee guard y=0.105  x=-0.100   Red
          Knee joint y=0.095  x=-0.100   Yellow sphere
          Shin       y=0.010  x=-0.100   White
          Ankle      y=-0.105 x=-0.100   Blue
          Boot       y=-0.155 x=-0.100   Blue+sole
      ════════════════════════════════════════════════════════════════════ */}
      <group ref={leftLegRef} scale={[legScaleXZ, legScaleY, legScaleXZ]}>
        {/* Hip ball joint */}
        <mesh position={[-0.095, 0.300, 0]} castShadow>
          <sphereGeometry args={[0.048, 10, 8]} />
          {M.blue()}
        </mesh>

        {/* Thigh – deep blue, wide */}
        <mesh position={[-0.095, 0.215, 0]} castShadow>
          <boxGeometry args={[0.105, 0.165, 0.108]} />
          {M.blue()}
        </mesh>
        {/* Thigh back panel */}
        <mesh position={[-0.095, 0.215, -0.050]} castShadow>
          <boxGeometry args={[0.090, 0.130, 0.010]} />
          {M.blueL()}
        </mesh>

        {/* Knee guard – red block on front */}
        <mesh position={[-0.095, 0.112, 0.042]} castShadow>
          <boxGeometry args={[0.095, 0.055, 0.045]} />
          {M.red()}
        </mesh>
        {/* Knee joint sphere – yellow */}
        <mesh position={[-0.095, 0.108, 0]} castShadow>
          <sphereGeometry args={[0.038, 10, 8]} />
          {M.yellow()}
        </mesh>

        {/* Shin front – white armor */}
        <mesh position={[-0.095, 0.020, 0.032]} castShadow>
          <boxGeometry args={[0.085, 0.160, 0.060]} />
          {M.white()}
        </mesh>
        {/* Shin core – blue back */}
        <mesh position={[-0.095, 0.020, -0.028]} castShadow>
          <boxGeometry args={[0.078, 0.155, 0.052]} />
          {M.blue()}
        </mesh>
        {/* Shin panel lines */}
        <mesh position={[-0.118, 0.020, 0.050]} castShadow>
          <boxGeometry args={[0.006, 0.090, 0.004]} />
          {M.panel()}
        </mesh>
        <mesh position={[-0.072, 0.020, 0.050]} castShadow>
          <boxGeometry args={[0.006, 0.090, 0.004]} />
          {M.panel()}
        </mesh>

        {/* Ankle + foot – blue */}
        <mesh position={[-0.095, -0.102, 0]} castShadow>
          <boxGeometry args={[0.088, 0.055, 0.095]} />
          {M.blue()}
        </mesh>
        {/* Boot sole toe */}
        <mesh position={[-0.095, -0.140, 0.028]} castShadow>
          <boxGeometry args={[0.082, 0.022, 0.110]} />
          {M.blue()}
        </mesh>
        {/* Boot heel */}
        <mesh position={[-0.095, -0.140, -0.040]} castShadow>
          <boxGeometry args={[0.082, 0.022, 0.038]} />
          {M.blue()}
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════════
          RIGHT LEG (mirror)
      ════════════════════════════════════════════════════════════════════ */}
      <group ref={rightLegRef} scale={[legScaleXZ, legScaleY, legScaleXZ]}>
        {/* Hip ball */}
        <mesh position={[0.095, 0.300, 0]} castShadow>
          <sphereGeometry args={[0.048, 10, 8]} />
          {M.blue()}
        </mesh>

        {/* Thigh */}
        <mesh position={[0.095, 0.215, 0]} castShadow>
          <boxGeometry args={[0.105, 0.165, 0.108]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.095, 0.215, -0.050]} castShadow>
          <boxGeometry args={[0.090, 0.130, 0.010]} />
          {M.blueL()}
        </mesh>

        {/* Knee guard red */}
        <mesh position={[0.095, 0.112, 0.042]} castShadow>
          <boxGeometry args={[0.095, 0.055, 0.045]} />
          {M.red()}
        </mesh>
        {/* Knee sphere yellow */}
        <mesh position={[0.095, 0.108, 0]} castShadow>
          <sphereGeometry args={[0.038, 10, 8]} />
          {M.yellow()}
        </mesh>

        {/* Shin front white */}
        <mesh position={[0.095, 0.020, 0.032]} castShadow>
          <boxGeometry args={[0.085, 0.160, 0.060]} />
          {M.white()}
        </mesh>
        <mesh position={[0.095, 0.020, -0.028]} castShadow>
          <boxGeometry args={[0.078, 0.155, 0.052]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.118, 0.020, 0.050]} castShadow>
          <boxGeometry args={[0.006, 0.090, 0.004]} />
          {M.panel()}
        </mesh>
        <mesh position={[0.072, 0.020, 0.050]} castShadow>
          <boxGeometry args={[0.006, 0.090, 0.004]} />
          {M.panel()}
        </mesh>

        {/* Boot */}
        <mesh position={[0.095, -0.102, 0]} castShadow>
          <boxGeometry args={[0.088, 0.055, 0.095]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.095, -0.140, 0.028]} castShadow>
          <boxGeometry args={[0.082, 0.022, 0.110]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.095, -0.140, -0.040]} castShadow>
          <boxGeometry args={[0.082, 0.022, 0.038]} />
          {M.blue()}
        </mesh>
      </group>

    </group>
  );
};
