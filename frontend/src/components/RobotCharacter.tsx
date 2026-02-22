import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFSMStore, State } from '../store/useFSMStore';
import { navMesh } from '../utils/NavMeshGenerator';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
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
import { createSurfaceMaps, disposeSurfaceMaps } from '../utils/proceduralPBR';

const SPEED_NORMAL = 1.5;
const SPEED_EVADE  = 5.0;
const DEFAULT_HERO_ROBOT_GLB_URL = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

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
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const [heroScene, setHeroScene] = React.useState<THREE.Group | null>(null);

  const { currentState, targetPosition, updateBasicMovement, activeTextureUrl,
          robotStats, robotMeta, robotDna } = useFSMStore();
  const heroModelUrl = import.meta.env.VITE_HERO_ROBOT_GLB_URL || DEFAULT_HERO_ROBOT_GLB_URL;
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
    let disposed = false;
    const loader = new GLTFLoader();
    loader.load(
      heroModelUrl,
      (gltf) => {
        if (disposed) return;
        // SkinnedMeshは通常のclone(true)だと骨参照が壊れることがあるため、SkeletonUtilsで複製する。
        const scene = cloneSkeleton(gltf.scene) as THREE.Group;
        scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        setHeroScene(scene);
        console.info('[RobotCharacter] hero GLB loaded:', heroModelUrl);
      },
      undefined,
      () => {
        if (disposed) return;
        setHeroScene(null);
        console.warn('[RobotCharacter] hero GLB load failed, fallback mesh active:', heroModelUrl);
      },
    );
    return () => {
      disposed = true;
    };
  }, [heroModelUrl]);

  React.useEffect(() => {
    return () => {
      if (!heroScene) return;
      heroScene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose?.();
      });
    };
  }, [heroScene]);

  React.useEffect(() => {
    if (activeTextureUrl && materialRef.current) {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(activeTextureUrl, (texture) => {
        texture.flipY = false;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.2, 1.2);
        texture.colorSpace = THREE.SRGBColorSpace;
        materialRef.current!.map = texture;
        if (materialRef.current) {
           materialRef.current.needsUpdate = true;
        }
      });
    } else {
      if (materialRef.current) {
        materialRef.current.map = null;
        materialRef.current.needsUpdate = true;
      }
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
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
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
  const surfaceMaps = React.useMemo(() => {
    if (typeof document === 'undefined') {
      return { white: null, blue: null, dark: null };
    }
    return {
      white: createSurfaceMaps({
        seed: robotDna.seed ^ 0x17A3,
        baseColor: C.white,
        lineColor: C.silver,
        grimeColor: C.black,
        emissiveColor: C.cyan,
      }),
      blue: createSurfaceMaps({
        seed: robotDna.seed ^ 0x2B19,
        baseColor: C.blue,
        lineColor: C.blueL,
        grimeColor: C.blackM,
        emissiveColor: C.cyan,
      }),
      dark: createSurfaceMaps({
        seed: robotDna.seed ^ 0x4C21,
        baseColor: C.black,
        lineColor: C.panel,
        grimeColor: '#10141A',
        emissiveColor: C.cyan,
      }),
    };
  }, [robotDna.seed, C.white, C.silver, C.black, C.blue, C.blueL, C.blackM, C.panel, C.cyan]);
  React.useEffect(() => () => {
    disposeSurfaceMaps(surfaceMaps.white);
    disposeSurfaceMaps(surfaceMaps.blue);
    disposeSurfaceMaps(surfaceMaps.dark);
  }, [surfaceMaps]);

  const withMaps = React.useCallback((key: 'white' | 'blue' | 'dark') => {
    const maps = surfaceMaps[key];
    return maps
      ? {
          map: maps.albedo,
          roughnessMap: maps.roughness,
          metalnessMap: maps.metalness,
          emissiveMap: maps.emissive,
        }
      : {};
  }, [surfaceMaps]);

  // ─── Material factory helpers ────────────────────────────────────────────
  const M = {
    white:  (r=0.30, m=0.25) => <meshPhysicalMaterial color={C.white} {...withMaps('white')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.whiteB} emissiveIntensity={0.05} clearcoat={0.45} clearcoatRoughness={0.25} />,
    whiteB: (r=0.40, m=0.20) => <meshPhysicalMaterial color={C.whiteB} {...withMaps('white')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.whiteB} emissiveIntensity={0.04} clearcoat={0.28} clearcoatRoughness={0.33} />,
    blue:   (r=0.35, m=0.55) => <meshPhysicalMaterial color={C.blue} {...withMaps('blue')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.blueL} emissiveIntensity={0.06} clearcoat={0.2} clearcoatRoughness={0.35} />,
    blueL:  (r=0.40, m=0.45) => <meshPhysicalMaterial color={C.blueL} {...withMaps('blue')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.blueL} emissiveIntensity={0.05} clearcoat={0.18} clearcoatRoughness={0.4} />,
    red:    (r=0.35, m=0.40) => <meshPhysicalMaterial color={C.red} {...withMaps('blue')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.red} emissiveIntensity={0.05} clearcoat={0.18} clearcoatRoughness={0.42} />,
    redD:   (r=0.45, m=0.35) => <meshPhysicalMaterial color={C.redD} {...withMaps('dark')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.redD} emissiveIntensity={0.04} clearcoat={0.12} clearcoatRoughness={0.5} />,
    yellow: (r=0.30, m=0.30) => <meshPhysicalMaterial color={C.yellow} {...withMaps('white')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.yellow} emissiveIntensity={0.04} clearcoat={0.22} clearcoatRoughness={0.28} />,
    black:  (r=0.50, m=0.60) => <meshPhysicalMaterial color={C.black} {...withMaps('dark')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.blackM} emissiveIntensity={0.03} clearcoat={0.15} clearcoatRoughness={0.48} />,
    blackM: (r=0.60, m=0.40) => <meshPhysicalMaterial color={C.blackM} {...withMaps('dark')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.blackM} emissiveIntensity={0.03} clearcoat={0.1} clearcoatRoughness={0.52} />,
    skin:   ()               => <meshPhysicalMaterial color={C.silver} {...withMaps('white')} roughness={tuneRough(0.42)} metalness={0.72} emissive={C.whiteB} emissiveIntensity={0.02} clearcoat={0.26} clearcoatRoughness={0.36} />,
    silver: (r=0.25, m=0.70) => <meshPhysicalMaterial color={C.silver} {...withMaps('white')} roughness={tuneRough(r)} metalness={tuneMetal(m)} emissive={C.whiteB} emissiveIntensity={0.05} clearcoat={0.55} clearcoatRoughness={0.22} />,
    panel:  ()               => <meshPhysicalMaterial color={C.panel} {...withMaps('dark')} roughness={tuneRough(0.50)} metalness={tuneMetal(0.35)} emissive={C.panel} emissiveIntensity={0.03} clearcoat={0.16} clearcoatRoughness={0.5} />,
    visor:  ()               => <meshPhysicalMaterial color={C.cyan} emissive={C.cyan} emissiveMap={surfaceMaps.blue?.emissive} emissiveIntensity={dnaGlowIntensity} roughness={tuneRough(0.06)} metalness={tuneMetal(0.9)} transmission={0.35} thickness={0.45} ior={1.25} clearcoat={0.75} clearcoatRoughness={0.08} />,
  } as const;

  React.useEffect(() => {
    if (!heroScene) return;
    const roughBias = finishTuning.roughnessBias;
    const metalBias = finishTuning.metalBias;
    const applyRough = (value: number) => Math.max(0.02, Math.min(0.98, value + roughBias));
    const applyMetal = (value: number) => Math.max(0.0, Math.min(1.0, value + metalBias));
    const buildHeroMat = (params: THREE.MeshPhysicalMaterialParameters) => {
      const material = new THREE.MeshPhysicalMaterial(params);
      ((material as unknown) as { skinning?: boolean }).skinning = true;
      return material;
    };
    const whiteMaps = withMaps('white');
    const blueMaps = withMaps('blue');
    const darkMaps = withMaps('dark');
    const mats = [
      buildHeroMat({
        color: C.white,
        ...whiteMaps,
        roughness: applyRough(0.28),
        metalness: applyMetal(0.45),
        emissive: new THREE.Color(C.whiteB),
        emissiveIntensity: 0.04,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
      buildHeroMat({
        color: C.blue,
        ...blueMaps,
        roughness: applyRough(0.38),
        metalness: applyMetal(0.55),
        emissive: new THREE.Color(C.blueL),
        emissiveIntensity: 0.05,
        clearcoat: 0.18,
        clearcoatRoughness: 0.38,
      }),
      buildHeroMat({
        color: C.black,
        ...darkMaps,
        roughness: applyRough(0.56),
        metalness: applyMetal(0.62),
        emissive: new THREE.Color(C.blackM),
        emissiveIntensity: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
      buildHeroMat({
        color: C.cyan,
        emissive: new THREE.Color(C.cyan),
        emissiveMap: surfaceMaps.blue?.emissive,
        emissiveIntensity: Math.max(0.9, dnaGlowIntensity),
        roughness: applyRough(0.08),
        metalness: applyMetal(0.82),
        transmission: 0.4,
        thickness: 0.5,
        ior: 1.23,
        clearcoat: 0.82,
        clearcoatRoughness: 0.06,
      }),
    ];
    let idx = 0;
    heroScene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.material = mats[idx % mats.length];
      idx += 1;
    });
    return () => {
      mats.forEach((m) => m.dispose());
    };
  }, [heroScene, C.white, C.whiteB, C.blue, C.blueL, C.black, C.blackM, C.cyan, dnaGlowIntensity, surfaceMaps, withMaps, finishTuning.roughnessBias, finishTuning.metalBias]);

  // ── Derive visual scales from stats ──────────────────────────────────────
  const armScale = (1.0 + (robotStats.power / 99) * 0.55) * silhouette.arm;
  const legScaleY  = (1.0 + (robotStats.speed / 99) * 0.28) * silhouette.legY;
  const legScaleXZ = (1.0 - (robotStats.speed / 99) * 0.18) * silhouette.legXZ;
  const heroScale = 0.62 + ((robotStats.vit / 99) * 0.08);

  return (
    <group ref={groupRef} position={[0, 0, -1]} scale={[silhouette.body, silhouette.body, silhouette.body]}>
      {heroScene && (
        <group position={[0, -0.145, 0]} scale={[heroScale, heroScale, heroScale]} rotation={[0, Math.PI, 0]}>
          <primitive object={heroScene} />
        </group>
      )}

      <group visible={!heroScene}>
      {/* Head */}
      <group position={[0, 0.86, 0.01]}>
        <mesh castShadow scale={[1.0, 1.05, 0.9]}>
          <sphereGeometry args={[0.13, 24, 18]} />
          {M.white(0.24, 0.32)}
        </mesh>
        <mesh position={[0, -0.01, 0.08]} castShadow scale={[0.92, 0.66, 0.4]}>
          <sphereGeometry args={[0.13, 20, 14]} />
          {M.blackM(0.42, 0.52)}
        </mesh>
        <mesh position={[0, 0.01, 0.105]} castShadow scale={[0.56, 0.2, 0.3]}>
          <sphereGeometry args={[0.12, 20, 12]} />
          {M.visor()}
        </mesh>
        <mesh position={[-0.048, 0.01, 0.118]} castShadow>
          <boxGeometry args={[0.042, 0.016, 0.01]} />
          {M.visor()}
        </mesh>
        <mesh position={[0.048, 0.01, 0.118]} castShadow>
          <boxGeometry args={[0.042, 0.016, 0.01]} />
          {M.visor()}
        </mesh>
        <mesh position={[0, 0.145, -0.01]} castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.01, 0.016, 0.12, 10]} />
          {M.red()}
        </mesh>
        <mesh position={[-0.12, 0.028, -0.008]} castShadow rotation={[0, 0, -0.48]}>
          <boxGeometry args={[0.026, 0.11, 0.06]} />
          {M.blueL()}
        </mesh>
        <mesh position={[0.12, 0.028, -0.008]} castShadow rotation={[0, 0, 0.48]}>
          <boxGeometry args={[0.026, 0.11, 0.06]} />
          {M.blueL()}
        </mesh>
        <mesh position={[0, -0.118, -0.005]} castShadow>
          <cylinderGeometry args={[0.045, 0.052, 0.055, 14]} />
          {M.skin()}
        </mesh>
      </group>

      {/* Torso + backpack */}
      <group position={[0, 0.54, 0]}>
        <mesh castShadow scale={[1.08, 1.02, 0.78]}>
          <boxGeometry args={[0.3, 0.24, 0.22]} />
          {M.white(0.26, 0.32)}
        </mesh>
        <mesh position={[0, 0.09, 0.03]} castShadow scale={[1.0, 0.62, 0.62]}>
          <sphereGeometry args={[0.13, 20, 16]} />
          {M.blue(0.32, 0.58)}
        </mesh>
        <mesh position={[0, 0.02, 0.112]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.028, 20]} />
          <meshPhysicalMaterial
            ref={materialRef}
            color={C.cyan}
            emissive={C.cyan}
            emissiveIntensity={Math.max(0.7, dnaGlowIntensity)}
            roughness={tuneRough(0.18)}
            metalness={tuneMetal(0.82)}
            transmission={0.22}
            thickness={0.3}
            clearcoat={0.6}
            clearcoatRoughness={0.08}
          />
        </mesh>
        <mesh position={[0, 0.02, 0.095]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.062, 0.008, 10, 24]} />
          {M.silver(0.2, 0.72)}
        </mesh>
        <mesh position={[-0.096, -0.01, 0.108]} castShadow>
          <boxGeometry args={[0.068, 0.128, 0.014]} />
          {M.panel()}
        </mesh>
        <mesh position={[0.096, -0.01, 0.108]} castShadow>
          <boxGeometry args={[0.068, 0.128, 0.014]} />
          {M.panel()}
        </mesh>
        <mesh position={[0, -0.104, 0.08]} castShadow>
          <boxGeometry args={[0.22, 0.028, 0.08]} />
          {M.skin()}
        </mesh>
        <mesh position={[-0.12, 0.03, -0.09]} castShadow rotation={[0.28, 0.1, -0.05]}>
          <cylinderGeometry args={[0.026, 0.035, 0.13, 12]} />
          {M.black(0.54, 0.6)}
        </mesh>
        <mesh position={[0.12, 0.03, -0.09]} castShadow rotation={[0.28, -0.1, 0.05]}>
          <cylinderGeometry args={[0.026, 0.035, 0.13, 12]} />
          {M.black(0.54, 0.6)}
        </mesh>
        <mesh position={[-0.12, -0.038, -0.13]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.016, 0.02, 10]} />
          {M.visor()}
        </mesh>
        <mesh position={[0.12, -0.038, -0.13]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.016, 0.02, 10]} />
          {M.visor()}
        </mesh>
      </group>

      {/* Waist */}
      <group position={[0, 0.35, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.29, 0.07, 0.18]} />
          {M.black(0.55, 0.64)}
        </mesh>
        <mesh position={[0, 0, 0.094]} castShadow>
          <boxGeometry args={[0.13, 0.056, 0.02]} />
          {M.red()}
        </mesh>
        <mesh position={[0, 0, 0.105]} castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.01, 10]} />
          {M.yellow(0.2, 0.28)}
        </mesh>
        <mesh position={[-0.158, -0.01, 0]} castShadow rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.038, 0.08, 0.15]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.158, -0.01, 0]} castShadow rotation={[0, 0, -0.1]}>
          <boxGeometry args={[0.038, 0.08, 0.15]} />
          {M.blue()}
        </mesh>
      </group>

      {/* Left arm */}
      <group ref={leftArmRef} scale={[armScale, 1.0, armScale]}>
        <mesh position={[-0.195, 0.644, 0]} castShadow>
          <sphereGeometry args={[0.052, 14, 10]} />
          {M.white()}
        </mesh>
        <mesh position={[-0.245, 0.658, 0]} castShadow rotation={[0, 0, -0.16]}>
          <sphereGeometry args={[0.08, 18, 12]} />
          {M.whiteB()}
        </mesh>
        <mesh position={[-0.268, 0.525, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.045, 0.17, 16]} />
          {M.white(0.3, 0.34)}
        </mesh>
        <mesh position={[-0.268, 0.418, 0]} castShadow>
          <sphereGeometry args={[0.033, 12, 10]} />
          {M.yellow()}
        </mesh>
        <mesh position={[-0.268, 0.318, 0]} castShadow>
          <boxGeometry args={[0.082, 0.16, 0.085]} />
          {M.black()}
        </mesh>
        <mesh position={[-0.232, 0.318, 0.028]} castShadow>
          <boxGeometry args={[0.008, 0.15, 0.008]} />
          {M.silver()}
        </mesh>
        <mesh position={[-0.29, 0.318, 0.055]} castShadow rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.016, 0.132, 0.014]} />
          {M.red()}
        </mesh>
        <mesh position={[-0.268, 0.22, 0]} castShadow>
          <sphereGeometry args={[0.038, 12, 10]} />
          {M.skin()}
        </mesh>
      </group>

      {/* Right arm */}
      <group ref={rightArmRef} scale={[armScale, 1.0, armScale]}>
        <mesh position={[0.195, 0.644, 0]} castShadow>
          <sphereGeometry args={[0.052, 14, 10]} />
          {M.white()}
        </mesh>
        <mesh position={[0.245, 0.658, 0]} castShadow rotation={[0, 0, 0.16]}>
          <sphereGeometry args={[0.08, 18, 12]} />
          {M.whiteB()}
        </mesh>
        <mesh position={[0.268, 0.525, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.045, 0.17, 16]} />
          {M.white(0.3, 0.34)}
        </mesh>
        <mesh position={[0.268, 0.418, 0]} castShadow>
          <sphereGeometry args={[0.033, 12, 10]} />
          {M.yellow()}
        </mesh>
        <mesh position={[0.268, 0.318, 0]} castShadow>
          <boxGeometry args={[0.082, 0.16, 0.085]} />
          {M.black()}
        </mesh>
        <mesh position={[0.232, 0.318, 0.028]} castShadow>
          <boxGeometry args={[0.008, 0.15, 0.008]} />
          {M.silver()}
        </mesh>
        <mesh position={[0.29, 0.318, 0.055]} castShadow rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.016, 0.132, 0.014]} />
          {M.red()}
        </mesh>
        <mesh position={[0.268, 0.22, 0]} castShadow>
          <sphereGeometry args={[0.038, 12, 10]} />
          {M.skin()}
        </mesh>
      </group>

      {/* Left leg */}
      <group ref={leftLegRef} scale={[legScaleXZ, legScaleY, legScaleXZ]}>
        <mesh position={[-0.098, 0.3, 0]} castShadow>
          <sphereGeometry args={[0.046, 12, 10]} />
          {M.blue()}
        </mesh>
        <mesh position={[-0.098, 0.214, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.056, 0.16, 14]} />
          {M.blue()}
        </mesh>
        <mesh position={[-0.098, 0.205, -0.05]} castShadow>
          <boxGeometry args={[0.08, 0.12, 0.012]} />
          {M.blueL()}
        </mesh>
        <mesh position={[-0.098, 0.112, 0.044]} castShadow>
          <boxGeometry args={[0.094, 0.05, 0.046]} />
          {M.red()}
        </mesh>
        <mesh position={[-0.098, 0.107, 0]} castShadow>
          <sphereGeometry args={[0.034, 12, 10]} />
          {M.yellow()}
        </mesh>
        <mesh position={[-0.098, 0.018, 0.028]} castShadow>
          <cylinderGeometry args={[0.038, 0.042, 0.16, 14]} />
          {M.white()}
        </mesh>
        <mesh position={[-0.098, 0.012, -0.03]} castShadow>
          <cylinderGeometry args={[0.035, 0.039, 0.14, 14]} />
          {M.blue()}
        </mesh>
        <mesh position={[-0.098, -0.098, 0]} castShadow>
          <boxGeometry args={[0.09, 0.052, 0.098]} />
          {M.blue()}
        </mesh>
        <mesh position={[-0.098, -0.136, 0.03]} castShadow>
          <boxGeometry args={[0.086, 0.022, 0.112]} />
          {M.blue()}
        </mesh>
      </group>

      {/* Right leg */}
      <group ref={rightLegRef} scale={[legScaleXZ, legScaleY, legScaleXZ]}>
        <mesh position={[0.098, 0.3, 0]} castShadow>
          <sphereGeometry args={[0.046, 12, 10]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.098, 0.214, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.056, 0.16, 14]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.098, 0.205, -0.05]} castShadow>
          <boxGeometry args={[0.08, 0.12, 0.012]} />
          {M.blueL()}
        </mesh>
        <mesh position={[0.098, 0.112, 0.044]} castShadow>
          <boxGeometry args={[0.094, 0.05, 0.046]} />
          {M.red()}
        </mesh>
        <mesh position={[0.098, 0.107, 0]} castShadow>
          <sphereGeometry args={[0.034, 12, 10]} />
          {M.yellow()}
        </mesh>
        <mesh position={[0.098, 0.018, 0.028]} castShadow>
          <cylinderGeometry args={[0.038, 0.042, 0.16, 14]} />
          {M.white()}
        </mesh>
        <mesh position={[0.098, 0.012, -0.03]} castShadow>
          <cylinderGeometry args={[0.035, 0.039, 0.14, 14]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.098, -0.098, 0]} castShadow>
          <boxGeometry args={[0.09, 0.052, 0.098]} />
          {M.blue()}
        </mesh>
        <mesh position={[0.098, -0.136, 0.03]} castShadow>
          <boxGeometry args={[0.086, 0.022, 0.112]} />
          {M.blue()}
        </mesh>
      </group>
      </group>
    </group>
  );
};
