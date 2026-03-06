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
import { GAMEPLAY_RULES } from '../constants/gameplay';
import {
  HOLD_AFTER_FINISH_CLIPS,
  ONE_SHOT_CLIPS,
  collectCharacterClips,
  createActionKey,
  getCombatStatePolicy,
  resolveLocalCharacterAction,
  type CharacterActionSpec,
  type CharacterClipName,
} from '../utils/characterAnimation';

const SPEED_NORMAL = 1.5;
const SPEED_EVADE  = 5.0;
const GROUND_CLEARANCE_EPSILON = 0.004;
const GROUND_CONTACT_BIAS = -0.012;
const ROOT_DRIVE_BONE_RE = /(armature|hips|mixamorighips|root)/i;
const setFacingYaw = (group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) => {
  const dirX = to.x - from.x;
  const dirZ = to.z - from.z;
  const lenSq = (dirX * dirX) + (dirZ * dirZ);
  if (lenSq < 1e-8) return;
  const yaw = Math.atan2(dirX, dirZ);
  group.rotation.y = yaw;
};

const stripRootPositionTracks = (clips: THREE.AnimationClip[]): THREE.AnimationClip[] =>
  clips.map((clip) => {
    const sanitized = clip.clone();
    // Gameplay code owns locomotion; remove root-bone position tracks to
    // prevent animation-side vertical drift that makes feet float.
    sanitized.tracks = sanitized.tracks.filter((track) => {
      const name = String(track.name || '').toLowerCase();
      if (!name.endsWith('.position')) return true;
      return !ROOT_DRIVE_BONE_RE.test(name);
    });
    return sanitized;
  });

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
  type PlayedAction = {
    key: string;
    name: CharacterClipName;
    action: THREE.AnimationAction;
  };
  type HitAwareAction = THREE.AnimationAction & { _hasHit?: boolean };

  const groupRef     = useRef<THREE.Group>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const waypointsRef = useRef<THREE.Vector3[]>([]);
  const lastTargetRef= useRef<THREE.Vector3 | null>(null);
  const lastSyncAtRef = useRef<number>(0);
  const localStoreTimerRef = useRef<number | null>(null);
  const roamTimerRef = useRef<number | null>(null);
  const lastLocalStoreSyncAtRef = useRef<number>(0);
  const lastLocalStorePosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const prevPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, -1));
  const hoverTimerRef = useRef<number>(0);
  const clipGroundOffsetRef = useRef<Partial<Record<CharacterClipName, number>>>({});
  const groundBoundsRef = useRef(new THREE.Box3());
  const worldScaleRef = useRef(new THREE.Vector3(1, 1, 1));
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<PlayedAction | null>(null);
  const lastAnimStateRef = useRef<State | null>(null);
  const [heroScene, setHeroScene] = React.useState<THREE.Group | null>(null);
  const [heroAnimations, setHeroAnimations] = React.useState<THREE.AnimationClip[]>([]);
  const [heroBaseMinY, setHeroBaseMinY] = React.useState<number | null>(null);

  const currentState = useFSMStore(s => s.currentState);
  const targetPosition = useFSMStore(s => s.targetPosition);
  const robotStats = useFSMStore(s => s.robotStats);
  const robotMeta = useFSMStore(s => s.robotMeta);
  const robotDna = useFSMStore(s => s.robotDna);
  const modelType = useFSMStore(s => s.modelType);
  const playMode = useFSMStore(s => s.playMode);
  const heroModelUrl = `/models/${modelType}/Character_output.glb`;
  const fallbackModelUrl = `/models/${modelType === 'A' ? 'B' : 'A'}/Character_output.glb`;
  const silhouette = getSilhouetteScales(robotDna);
  const finishTuning = getFinishMaterialTuning(robotDna.finish);
  const dnaGlowIntensity = Math.max(0.9, Math.min(1.8, robotDna.glowIntensity || 1.0));
  const scarRoughnessBoost = (robotDna.scarLevel || 0) * 0.035;
  const heroScale = 0.62 + ((robotStats.vit / 99) * 0.08);
  const heroOffsetY = (heroBaseMinY !== null ? (-heroBaseMinY * heroScale) : 0) + GROUND_CONTACT_BIAS;

  React.useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    const sharedAnimationsUrl = '/animations/shared_animations.glb';
    type LoadedGLTF = { scene: THREE.Group; animations: THREE.AnimationClip[] };
    const loadAsync = (url: string) =>
      new Promise<LoadedGLTF>((resolve, reject) => {
        loader.load(url, (gltf) => resolve(gltf as LoadedGLTF), undefined, reject);
      });
    const loadBaseWithFallback = async (): Promise<LoadedGLTF> => {
      try {
        return await loadAsync(heroModelUrl);
      } catch (primaryErr) {
        console.warn('[RobotCharacter] hero GLB load failed, trying fallback:', heroModelUrl, primaryErr);
        return await loadAsync(fallbackModelUrl);
      }
    };

    const run = async () => {
      try {
        const baseGltf = await loadBaseWithFallback();
        if (disposed) return;

        // SkinnedMeshは通常のclone(true)だと骨参照が壊れることがあるため、SkeletonUtilsで複製する。
        const scene = cloneSkeleton(baseGltf.scene) as THREE.Group;
        scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        });
        const bounds = new THREE.Box3().setFromObject(scene);
        const minY = Number.isFinite(bounds.min.y) ? bounds.min.y : null;
        setHeroScene(scene);
        setHeroBaseMinY(minY);

        // Prefer shared animation pack; fall back to model-embedded clips.
        let animationSource = baseGltf.animations;
        try {
          const animGltf = await loadAsync(sharedAnimationsUrl);
          animationSource = animGltf.animations?.length ? animGltf.animations : animationSource;
        } catch (animErr) {
          console.warn('[RobotCharacter] shared animation GLB load failed; using base clips', animErr);
        }
        if (disposed) return;
        setHeroAnimations(stripRootPositionTracks(collectCharacterClips(animationSource)));
        console.info('[RobotCharacter] hero GLB loaded:', heroModelUrl);
      } catch (err) {
        if (disposed) return;
        setHeroScene(null);
        setHeroAnimations([]);
        setHeroBaseMinY(null);
        console.warn('[RobotCharacter] hero GLB load failed:', err);
      }
    };
    run();
    return () => {
      disposed = true;
    };
  }, [heroModelUrl, fallbackModelUrl]);

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
    if (!heroScene || heroAnimations.length === 0) return;
    mixerRef.current = new THREE.AnimationMixer(heroScene);
    actionRef.current = null;
    lastAnimStateRef.current = null;
    clipGroundOffsetRef.current = {};
    return () => {
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [heroScene, heroAnimations]);

  const playAction = React.useCallback(
    (spec: CharacterActionSpec, fadeDuration = 0.2, forceReplay = false) => {
      if (!mixerRef.current || heroAnimations.length === 0) return;

      let clip = THREE.AnimationClip.findByName(heroAnimations, spec.clip);
      if (!clip) clip = THREE.AnimationClip.findByName(heroAnimations, 'Idle');
      if (!clip) return;

      const key = createActionKey(spec);
      const prev = actionRef.current;
      if (prev?.key === key) {
        if (!forceReplay) return;
        if (!spec.loopOnce) return;
      }

      const nextAction = mixerRef.current.clipAction(clip);
      nextAction.reset();
      nextAction.paused = false;
      nextAction.setEffectiveTimeScale(spec.speed ?? 1);
      if (spec.pingPong) {
        nextAction.setLoop(THREE.LoopPingPong, spec.loopCount ?? 1);
        nextAction.clampWhenFinished = true;
      } else if ((spec.loopCount ?? 1) > 1) {
        nextAction.setLoop(THREE.LoopRepeat, spec.loopCount ?? 1);
        nextAction.clampWhenFinished = true;
      } else if (spec.loopOnce || ONE_SHOT_CLIPS.has(spec.clip)) {
        nextAction.setLoop(THREE.LoopOnce, 1);
        nextAction.clampWhenFinished = HOLD_AFTER_FINISH_CLIPS.has(spec.clip);
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
        nextAction.clampWhenFinished = false;
      }

      nextAction.play();
      if (prev) {
        nextAction.crossFadeFrom(prev.action, fadeDuration, true);
      }
      actionRef.current = { key, name: spec.clip, action: nextAction };
      (nextAction as HitAwareAction)._hasHit = false;
    },
    [heroAnimations],
  );


  // Apply battle-state glow via emissive only – preserves each part's unique colour
  React.useEffect(() => {
    if (!groupRef.current) return;
    const emissiveMap: Partial<Record<State, string>> = {
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
  }, [currentState, scarRoughnessBoost]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const pos = groupRef.current.position;
    const beforePos = pos.clone();

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
        // Face movement direction (yaw-only to avoid camera-like drift)
        setFacingYaw(groupRef.current, pos, nextWp);
      }
    } else if (playMode !== 'hub' && currentState === State.HOVERING && navMesh.isReady()) {
      // ── Priority 3: Auto-roaming when hovering ──────────────────────────
      hoverTimerRef.current += delta;
      if (hoverTimerRef.current > 3.0) {
        hoverTimerRef.current = 0;
        const randomTarget = new THREE.Vector3(
          pos.x + (Math.random() - 0.5) * 2.0,
          pos.y,
          pos.z + (Math.random() - 0.5) * 2.0
        );
        if (roamTimerRef.current) {
          clearTimeout(roamTimerRef.current);
        }
        roamTimerRef.current = window.setTimeout(() => {
          useFSMStore.getState().updateBasicMovement(randomTarget);
          roamTimerRef.current = null;
        }, 0);
      }
    }
    const localAnchor = useArenaSyncStore.getState().localCalibration?.point ?? { x: 0, y: 0, z: 0 };
    const arenaCenter = new THREE.Vector3(localAnchor.x, localAnchor.y, localAnchor.z);
    if (pos.distanceTo(arenaCenter) > GAMEPLAY_RULES.arenaRadiusMeters) {
      pos
        .sub(arenaCenter)
        .normalize()
        .multiplyScalar(GAMEPLAY_RULES.arenaRadiusMeters)
        .add(arenaCenter);
    }

    groupRef.current.scale.setScalar(silhouette.body);
    mixerRef.current?.update(delta);

    const movedDistance = beforePos.distanceTo(pos);
    const isMoving = movedDistance > 0.0004;
    const resolvedAction = resolveLocalCharacterAction(currentState, isMoving);
    const stateChanged = lastAnimStateRef.current !== currentState;
    playAction(resolvedAction, 0.15, stateChanged && resolvedAction.loopOnce === true);
    lastAnimStateRef.current = currentState;
    const activeClip = actionRef.current?.name;
    const modelGroup = modelGroupRef.current;
    if (modelGroup && activeClip) {
      const parentScaleY = Math.max(1e-4, groupRef.current.getWorldScale(worldScaleRef.current).y);
      let clipOffset = clipGroundOffsetRef.current[activeClip] ?? 0;
      modelGroup.position.y = heroOffsetY + clipOffset;
      const bounds = groundBoundsRef.current.setFromObject(modelGroup);
      if (Number.isFinite(bounds.min.y)) {
        const groundY = groupRef.current.position.y;
        const clearance = bounds.min.y - groundY;
        if (Math.abs(clearance) > GROUND_CLEARANCE_EPSILON) {
          clipOffset -= clearance / parentScaleY;
          clipGroundOffsetRef.current[activeClip] = clipOffset;
          modelGroup.position.y = heroOffsetY + clipOffset;
        } else if (clipGroundOffsetRef.current[activeClip] === undefined) {
          clipGroundOffsetRef.current[activeClip] = clipOffset;
        }
      }
    } else if (modelGroup) {
      modelGroup.position.y = heroOffsetY;
    }

    const remotePos = useFSMStore.getState().remoteRobotPosition;
    if (
      remotePos &&
      currentState !== State.EMERGENCY_EVADE &&
      currentState !== State.EVADE_TO_COVER &&
      currentState !== State.FLANKING_RIGHT
    ) {
      setFacingYaw(groupRef.current, pos, remotePos);
    }

    const hitStatePolicy = getCombatStatePolicy(currentState, {
      fallbackState: 'HOVERING',
      source: 'local_hit_window',
    });
    if (hitStatePolicy.hitWindow && actionRef.current && remotePos) {
      const action = actionRef.current.action as HitAwareAction;
      if (action.isRunning()) {
        const clipDur = action.getClip().duration;
        const progress = clipDur > 0 ? action.time / clipDur : 0;
        if (progress < hitStatePolicy.hitWindow.start) {
          action._hasHit = false;
        }
        if (
          progress >= hitStatePolicy.hitWindow.start &&
          progress <= hitStatePolicy.hitWindow.end &&
          !action._hasHit
        ) {
          const distToEnemy = pos.distanceTo(remotePos);
          if (distToEnemy <= hitStatePolicy.hitWindow.range) {
            action._hasHit = true;
            const hitPayload: WebRTCDataChannelPayload = {
              type: 'event',
              data: {
                event: 'hit_confirmed',
                user: PLAYER_ID,
                payload: { damage: hitStatePolicy.hitWindow.damage },
              } as unknown as Record<string, unknown>,
            };
            if (!rtcService.send(hitPayload)) {
              wsService.sendEvent(hitPayload.data as unknown as Record<string, unknown>);
            }
          }
        }
      }
    }



    const now = performance.now();
    if (playMode === 'match') {
      if (
        now - lastLocalStoreSyncAtRef.current >= 80 &&
        lastLocalStorePosRef.current.distanceToSquared(pos) > 1e-6
      ) {
        const cloned = pos.clone();
        if (localStoreTimerRef.current) {
          clearTimeout(localStoreTimerRef.current);
        }
        localStoreTimerRef.current = window.setTimeout(() => {
          useFSMStore.getState().setLocalRobotPosition(cloned);
          localStoreTimerRef.current = null;
        }, 0);
        lastLocalStorePosRef.current.copy(pos);
        lastLocalStoreSyncAtRef.current = now;
      }
    }

    if (playMode === 'match' && now - lastSyncAtRef.current >= 50) {
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

  // Dynamic skin texture loader
  const [skinTex, setSkinTex] = React.useState<THREE.Texture | null>(null);
  React.useEffect(() => {
    let active = true;
    if (robotDna.skinUrl) {
      new THREE.TextureLoader().load(robotDna.skinUrl, (tex) => {
        if (!active) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        setSkinTex(tex);
      });
    } else {
      setSkinTex(null);
    }
    return () => { active = false; };
  }, [robotDna.skinUrl]);

  React.useEffect(() => {
    if (!heroScene) return;
    const roughBias = finishTuning.roughnessBias;
    const metalBias = finishTuning.metalBias;
    const primaryBodyColor = modelType === 'B' ? C.red : C.blue;
    const secondaryBodyColor = modelType === 'B' ? C.yellow : C.white;
    const accentEmissiveColor = modelType === 'B' ? C.redD : C.blueL;
    const visorGlowColor = modelType === 'B' ? C.yellow : C.cyan;
    const applyRough = (value: number) => Math.max(0.02, Math.min(0.98, value + roughBias));
    const applyMetal = (value: number) => Math.max(0.0, Math.min(1.0, value + metalBias));
    const buildHeroMat = (params: THREE.MeshPhysicalMaterialParameters) => {
      const material = new THREE.MeshPhysicalMaterial(params);
      ((material as unknown) as { skinning?: boolean }).skinning = true;
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.depthTest = true;
      material.blending = THREE.NormalBlending;
      material.transmission = 0;
      return material;
    };
    const whiteMaps = withMaps('white');
    const blueMaps = withMaps('blue');
    const darkMaps = withMaps('dark');


    const mats = [
      buildHeroMat({
        color: skinTex ? 0xffffff : primaryBodyColor,
        map: skinTex || blueMaps.map,
        roughnessMap: blueMaps.roughnessMap,
        metalnessMap: blueMaps.metalnessMap,
        emissiveMap: blueMaps.emissiveMap,
        roughness: applyRough(0.34),
        metalness: applyMetal(0.58),
        emissive: new THREE.Color(accentEmissiveColor),
        emissiveIntensity: 0.06,
        clearcoat: 0.22,
        clearcoatRoughness: 0.34,
      }),
      buildHeroMat({
        color: skinTex ? 0xffffff : secondaryBodyColor,
        map: skinTex || whiteMaps.map,
        roughnessMap: whiteMaps.roughnessMap,
        metalnessMap: whiteMaps.metalnessMap,
        emissiveMap: whiteMaps.emissiveMap,
        roughness: applyRough(0.28),
        metalness: applyMetal(0.45),
        emissive: new THREE.Color(C.whiteB),
        emissiveIntensity: 0.04,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
      buildHeroMat({
        color: skinTex ? 0xffffff : C.black,
        map: skinTex || darkMaps.map,
        roughnessMap: darkMaps.roughnessMap,
        metalnessMap: darkMaps.metalnessMap,
        emissiveMap: darkMaps.emissiveMap,
        roughness: applyRough(0.56),
        metalness: applyMetal(0.62),
        emissive: new THREE.Color(C.blackM),
        emissiveIntensity: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
      buildHeroMat({
        color: visorGlowColor,
        emissive: new THREE.Color(visorGlowColor),
        emissiveMap: surfaceMaps.blue?.emissive,
        emissiveIntensity: Math.max(0.9, dnaGlowIntensity),
        roughness: applyRough(0.08),
        metalness: applyMetal(0.82),
        transmission: 0,
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
  }, [heroScene, C.white, C.whiteB, C.blue, C.blueL, C.black, C.blackM, C.cyan, C.red, C.redD, C.yellow, dnaGlowIntensity, modelType, surfaceMaps, withMaps, finishTuning.roughnessBias, finishTuning.metalBias, skinTex]);

  React.useEffect(() => () => {
    if (localStoreTimerRef.current) {
      clearTimeout(localStoreTimerRef.current);
      localStoreTimerRef.current = null;
    }
    if (roamTimerRef.current) {
      clearTimeout(roamTimerRef.current);
      roamTimerRef.current = null;
    }
  }, []);

  return (
    <group ref={groupRef} position={[0, 0, -1]} scale={[silhouette.body, silhouette.body, silhouette.body]}>
      {heroScene && (
        <group ref={modelGroupRef} position={[0, heroOffsetY, 0]} scale={[heroScale, heroScale, heroScale]}>
          <primitive object={heroScene} />
        </group>
      )}
    </group>
  );
};
