import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { wsService } from '../services/WebSocketService';
import { rtcService } from '../services/WebRTCDataChannelService';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import { useFSMStore } from '../store/useFSMStore';
import { GAMEPLAY_RULES } from '../constants/gameplay';
import type { SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { PLAYER_ID } from '../utils/identity';
import {
  COMBAT_STATE_POLICY,
  HOLD_AFTER_FINISH_CLIPS,
  ONE_SHOT_CLIPS,
  collectCharacterClips,
  createActionKey,
  getCombatStatePolicy,
  resolveAiCharacterAction,
  resolveSyncedCharacterAction,
  type CharacterActionSpec,
  type CharacterClipName,
} from '../utils/characterAnimation';
import { updateDepthOcclusionUniforms } from '../utils/depthOcclusion';

const HEIGHT_DEBUG = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_UI === 'true';

interface RemoteRobotCharacterProps {
  depthTexture?: THREE.DataTexture | null;
  depthRawToMeters?: number | null;
}

const ROOT_DRIVE_BONE_RE = /(armature|hips|mixamorighips|root)/i;
const setFacingYaw = (group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) => {
  const dirX = to.x - from.x;
  const dirZ = to.z - from.z;
  const lenSq = (dirX * dirX) + (dirZ * dirZ);
  if (lenSq < 1e-8) return;
  const yaw = Math.atan2(dirX, dirZ);
  group.rotation.set(0, yaw, 0);
};

const stripRemoteRootRotation = (clips: THREE.AnimationClip[]): THREE.AnimationClip[] =>
  clips.map((clip) => {
    const sanitized = clip.clone();
    // Enemy orientation/locomotion is driven by gameplay code; strip root-bone transforms
    // that can override lookAt and make the model appear camera-facing.
    sanitized.tracks = sanitized.tracks.filter((track) => {
      const name = String(track.name || '').toLowerCase();
      if (!(name.endsWith('.quaternion') || name.endsWith('.position'))) {
        return true;
      }
      return !ROOT_DRIVE_BONE_RE.test(name);
    });
    return sanitized;
  });

export const RemoteRobotCharacter: React.FC<RemoteRobotCharacterProps> = ({
  depthTexture = null,
  depthRawToMeters = null,
}) => {
  type PlayedAction = {
    key: string;
    name: CharacterClipName;
    action: THREE.AnimationAction;
  };
  type HitAwareAction = THREE.AnimationAction & { _hasHit?: boolean };

  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0, -1.5));
  const syncedStateRef = useRef<string | undefined>('HOVERING');
  
  // Model refs
  const [modelScene, setModelScene] = useState<THREE.Group | null>(null);
  const [animations, setAnimations] = useState<THREE.AnimationClip[]>([]);
  const [modelBaseMinY, setModelBaseMinY] = useState<number | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<PlayedAction | null>(null);
  const occlusionMaterialsRef = useRef<Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>([]);
  const rootBoneRef = useRef<THREE.Bone | null>(null);
  const rootBoneBasePosRef = useRef<THREE.Vector3 | null>(null);
  const rootBoneEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const heightBoundsRef = useRef(new THREE.Box3());
  const lastHeightEmitAtRef = useRef(0);
  const lastSyncAtRef = useRef(0);
  const prevEnemyHpRef = useRef(100);

  // AI State (Solo play)
  const aiStateRef = useRef<string>('IDLE');
  const aiTimerRef = useRef<number>(0);
  const aiDurationRef = useRef<number>(1.0);
  
  const hasRemotePeer = useArenaSyncStore(s => s.hasRemotePeer);
  const matchAlignmentReady = useArenaSyncStore(s => s.matchAlignmentReady);
  const localModelType = useFSMStore(s => s.modelType);

  // Sync effect (when connected to someone)
  useEffect(() => {
    const applySync = (sync: SyncData) => {
      if (sync.userId === PLAYER_ID) return;
      const mapped = useArenaSyncStore.getState().mapRemotePosition(sync.userId, sync.position);
      targetRef.current.set(mapped.x, mapped.y, mapped.z);
      syncedStateRef.current = sync.action;
      lastSyncAtRef.current = performance.now();
      // Let local player track remote via FSM
      useFSMStore.getState().setRemoteRobotPosition(targetRef.current.clone());
    };

    const onP2P = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      if (payload?.type !== 'sync') return;
      applySync(payload.data as SyncData);
    };

    const unsubscribe = wsService.addHandler((payload) => {
      if (payload.type !== 'sync') return;
      applySync(payload.data as SyncData);
    });

    window.addEventListener('webrtc_payload', onP2P as EventListener);
    return () => {
      unsubscribe();
      window.removeEventListener('webrtc_payload', onP2P as EventListener);
    };
  }, []);

  // Keep enemy rig identical to local rig to avoid model-specific facing mismatches.
  const opponentModelType = localModelType;

  // Load Model
  useEffect(() => {
    let disposed = false;
    const createdMaterials: THREE.Material[] = [];
    occlusionMaterialsRef.current = [];
    const loader = new GLTFLoader();

    const finalBaseUrl = `/models/${opponentModelType}/Character_output.glb`;
    const fallbackBaseUrl = `/models/${opponentModelType === 'A' ? 'B' : 'A'}/Character_output.glb`;
    const sharedAnimationsUrl = '/animations/shared_animations.glb';

    type LoadedGLTF = { scene: THREE.Group; animations: THREE.AnimationClip[] };
    const loadAsync = (url: string) => new Promise<LoadedGLTF>((resolve, reject) => {
      loader.load(url, (gltf) => resolve(gltf as LoadedGLTF), undefined, reject);
    });
    const loadBaseWithFallback = async (): Promise<LoadedGLTF> => {
      try {
        return await loadAsync(finalBaseUrl);
      } catch (primaryErr) {
        console.warn('[RemoteRobotCharacter] Base GLB load failed, trying fallback:', finalBaseUrl, primaryErr);
        return await loadAsync(fallbackBaseUrl);
      }
    };

    loadBaseWithFallback().then(async (baseGltf) => {
      if (disposed) return;
      const scene = cloneSkeleton(baseGltf.scene) as THREE.Group;
      rootBoneRef.current = null;
      rootBoneBasePosRef.current = null;
      
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          
          // Force blue-biased finish so untextured white meshes do not remain plain.
          if (mesh.material) {
            const m = (mesh.material as THREE.Material).clone();
            ((m as unknown) as { skinning?: boolean }).skinning = true;
            if ('color' in m) {
              const colorMaterial = m as THREE.Material & { color: THREE.Color };
              colorMaterial.color.set('#2f7dff');
            }
            if ('emissive' in m) {
              const emissiveMaterial = m as THREE.Material & { emissive: THREE.Color };
              emissiveMaterial.emissive.setHex(0x0f2b66);
            }
            if ('roughness' in m) {
              const roughMaterial = m as THREE.Material & { roughness: number };
              roughMaterial.roughness = Math.max(0.22, roughMaterial.roughness ?? 0.42);
            }
            if ('metalness' in m) {
              const metalMaterial = m as THREE.Material & { metalness: number };
              metalMaterial.metalness = Math.max(0.18, metalMaterial.metalness ?? 0.28);
            }
            if ('transparent' in m) {
              const transparentMaterial = m as THREE.Material & { transparent: boolean };
              transparentMaterial.transparent = false;
            }
            if ('opacity' in m) {
              const opacityMaterial = m as THREE.Material & { opacity: number };
              opacityMaterial.opacity = 1.0;
            }
            if ('alphaTest' in m) {
              const alphaMaterial = m as THREE.Material & { alphaTest: number };
              alphaMaterial.alphaTest = 0;
            }
            if ('transmission' in m) {
              const transmissionMaterial = m as THREE.Material & { transmission: number };
              transmissionMaterial.transmission = 0;
            }
            if ('depthWrite' in m) {
              const depthWriteMaterial = m as THREE.Material & { depthWrite: boolean };
              depthWriteMaterial.depthWrite = true;
            }
            if ('depthTest' in m) {
              const depthTestMaterial = m as THREE.Material & { depthTest: boolean };
              depthTestMaterial.depthTest = true;
            }
            if ('blending' in m) {
              const blendingMaterial = m as THREE.Material & { blending: THREE.Blending };
              blendingMaterial.blending = THREE.NormalBlending;
            }
            m.needsUpdate = true;
            mesh.material = m;
            createdMaterials.push(m);
          }
        }
      });
      
      const bounds = new THREE.Box3().setFromObject(scene);
      const minY = Number.isFinite(bounds.min.y) ? bounds.min.y : null;
      setModelScene(scene);
      setModelBaseMinY(minY);

      const preferredRoot = (
        scene.getObjectByName('Hips') ??
        scene.getObjectByName('mixamorigHips') ??
        scene.getObjectByName('Root') ??
        scene.getObjectByName('root')
      ) as THREE.Object3D | null;
      const rootBoneCandidate =
        (preferredRoot && (preferredRoot as THREE.Bone).isBone ? (preferredRoot as THREE.Bone) : null) ??
        (() => {
          let found: THREE.Bone | null = null;
          scene.traverse((obj) => {
            if (!found && (obj as THREE.Bone).isBone) {
              found = obj as THREE.Bone;
            }
          });
          return found;
        })();
      if (rootBoneCandidate) {
        rootBoneRef.current = rootBoneCandidate;
        rootBoneBasePosRef.current = rootBoneCandidate.position.clone();
      }

      let animationSource = baseGltf.animations;
      try {
        const animGltf = await loadAsync(sharedAnimationsUrl);
        animationSource = animGltf.animations?.length ? animGltf.animations : animationSource;
      } catch (animErr) {
        console.warn('[RemoteRobotCharacter] shared animation GLB load failed; using base clips', animErr);
      }
      if (disposed) return;
      const clips = stripRemoteRootRotation(collectCharacterClips(animationSource));

      // Keep both model variants grounded to the same world baseline.
      scene.position.y = 0.0;

      setAnimations(clips);
      console.info(`[RemoteRobotCharacter] Loaded rigged multi-GLB (${opponentModelType}):`, clips.length, 'clips');
    }).catch(err => {
      setModelBaseMinY(null);
      console.warn('[RemoteRobotCharacter] Rigged GLB load failed:', err);
    });

    return () => {
      disposed = true;
      occlusionMaterialsRef.current = [];
      rootBoneRef.current = null;
      rootBoneBasePosRef.current = null;
      createdMaterials.forEach((material) => material.dispose());
      if (mixerRef.current) mixerRef.current.stopAllAction();
    };
  }, [opponentModelType]);

  // Setup Mixer
  useEffect(() => {
    if (!modelScene || animations.length === 0) return;
    if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(modelScene);
  }, [modelScene, animations]);

  const playAction = React.useCallback(
    (spec: CharacterActionSpec, fadeDuration = 0.2, forceReplay = false) => {
      if (!mixerRef.current || animations.length === 0) return;

      let clip = THREE.AnimationClip.findByName(animations, spec.clip);
      if (!clip) {
        clip = THREE.AnimationClip.findByName(animations, 'Idle');
      }
      if (!clip) return;

      const key = createActionKey(spec);
      const prev = actionRef.current;
      if (prev?.key === key) {
        if (!forceReplay) return;
        if (!spec.loopOnce) return;
      }

      const nextAction = mixerRef.current.clipAction(clip);
      nextAction.reset();

      const speed = spec.speed ?? 1;
      nextAction.setEffectiveTimeScale(speed);
      if (speed < 0) {
        nextAction.time = clip.duration;
      }

      if (spec.loopOnce || ONE_SHOT_CLIPS.has(spec.clip)) {
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
    },
    [animations],
  );

  const chooseAiState = (distToPlayer: number) => {
    const enemyHp = useFSMStore.getState().enemyHp;
    if (enemyHp <= 0) return 'FAINT';

    let weights: { state: string, w: number }[] = [];

    if (distToPlayer > 1.5) {
      // Approach
      weights = [
        { state: 'RUN', w: 10 },
        { state: 'WALK', w: 3 },
        { state: 'SUPER_DASH', w: 2 },
      ];
    } else if (distToPlayer < 0.8) {
      // Close Combat
      weights = [
        { state: 'PUNCH', w: 5 },
        { state: 'KICK', w: 5 },
        { state: 'COMBO_PUNCH', w: 3 },
        { state: 'SHORYUKEN', w: 2 },
        { state: 'TORNADO_PUNCH', w: 1 },
        { state: 'EVADE_BACK', w: 4 }, // Retreat chance
        { state: 'DODGE_LEFT', w: 2 },
      ];
    } else {
      // Mid-range / neutral
      weights = [
        { state: 'WALK', w: 5 },
        { state: 'TAUNT', w: 2 },
        { state: 'BEAM_CHARGE', w: 1 },
        { state: 'EVADE_BACK', w: 2 },
        { state: 'IDLE', w: 2 },
      ];
    }

    const total = weights.reduce((acc, curr) => acc + curr.w, 0);
    let r = Math.random() * total;
    for (const item of weights) {
      r -= item.w;
      if (r <= 0) return item.state;
    }
    return 'IDLE';
  };

  const applyAiState = (state: string) => {
    const nextState = state && COMBAT_STATE_POLICY[state] ? state : 'IDLE';
    const policy = getCombatStatePolicy(state, { fallbackState: 'IDLE', source: 'remote_ai_apply' });

    aiStateRef.current = nextState;
    aiTimerRef.current = 0;

    const resolved = resolveAiCharacterAction(nextState);
    aiDurationRef.current = Number.isFinite(policy.duration) ? policy.duration : resolved.duration;
    playAction(resolved.action, 0.2, resolved.action.loopOnce === true);
    
    if (actionRef.current) {
       (actionRef.current.action as HitAwareAction)._hasHit = false;
    }
  };

  useEffect(() => {
    if (!modelScene || animations.length === 0) return;
    aiStateRef.current = 'IDLE';
    aiTimerRef.current = 0;
    const resolved = resolveAiCharacterAction('IDLE');
    aiDurationRef.current = resolved.duration;
    playAction(resolved.action, 0.15);
  }, [modelScene, animations, playAction]);

  useFrame((frameState, delta) => {
    for (const mat of occlusionMaterialsRef.current) {
      updateDepthOcclusionUniforms(mat, {
        depthTexture,
        depthRawToMeters,
        viewportWidth: frameState.size.width,
        viewportHeight: frameState.size.height,
        cameraNear: frameState.camera.near,
        cameraFar: frameState.camera.far,
      });
    }

    if (mixerRef.current) mixerRef.current.update(delta);
    const rootBone = rootBoneRef.current;
    if (rootBone) {
      const basePos = rootBoneBasePosRef.current;
      if (basePos) {
        rootBone.position.x = basePos.x;
        rootBone.position.z = basePos.z;
      }
      const euler = rootBoneEulerRef.current.setFromQuaternion(rootBone.quaternion);
      if (Number.isFinite(euler.y) && Math.abs(euler.y) > 1e-6) {
        euler.y = 0;
        rootBone.quaternion.setFromEuler(euler);
      }
    }
    const group = groupRef.current;
    if (!group) return;

    const currentPos = group.position;
    const localRobotPos = useFSMStore.getState().localRobotPosition;
    const hasRecentSync = (performance.now() - lastSyncAtRef.current) < 2400;
    const remoteDriven = hasRemotePeer && rtcService.isOpen() && hasRecentSync;

    if (!remoteDriven) {
      // ── SOLO AI LOOP ──
      // Track actual local robot position instead of the center origin
      const playerPos = useFSMStore.getState().localRobotPosition;
      
      const localAnchor = useArenaSyncStore.getState().localCalibration?.point ?? { x: 0, y: 0, z: 0 };
      const arenaCenter = new THREE.Vector3(localAnchor.x, localAnchor.y, localAnchor.z);
      
      // If player tracking isn't initialized yet, default to center
      const anchorVec = playerPos ? playerPos.clone() : arenaCenter;
      
      const distToAnchor = currentPos.distanceTo(anchorVec);

      aiTimerRef.current += delta;
      const state = aiStateRef.current;
      const fsmState = useFSMStore.getState();
      const enemyHpNow = fsmState.enemyHp;
      const statePolicy = getCombatStatePolicy(state, {
        fallbackState: 'IDLE',
        source: 'remote_ai_frame',
      });

      if (
        enemyHpNow > 0 &&
        enemyHpNow < prevEnemyHpRef.current &&
        state !== 'FAINT' &&
        state !== 'CELEBRATE' &&
        state !== 'DAMAGE'
      ) {
        applyAiState('DAMAGE');
        prevEnemyHpRef.current = enemyHpNow;
        return;
      }

      // Immediate match-end override
      if (state !== 'FAINT' && state !== 'CELEBRATE') {
         if (fsmState.enemyHp <= 0) {
            applyAiState('FAINT');
            prevEnemyHpRef.current = enemyHpNow;
            return;
         } else if (fsmState.localHp <= 0) {
            applyAiState('CELEBRATE');
            prevEnemyHpRef.current = enemyHpNow;
            return;
         }
      }

      const motionTarget = anchorVec.clone();
      const applyRelativeMotion = () => {
        if (
          statePolicy.motion.kind !== 'retreat_from_target' &&
          statePolicy.motion.kind !== 'strafe_left' &&
          statePolicy.motion.kind !== 'strafe_right'
        ) {
          return false;
        }

        const forward = new THREE.Vector3().subVectors(motionTarget, currentPos);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) {
          group.getWorldDirection(forward);
          forward.y = 0;
        }
        if (forward.lengthSq() < 1e-6) {
          forward.set(0, 0, -1);
        } else {
          forward.normalize();
        }

        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        if (right.lengthSq() < 1e-6) {
          right.set(1, 0, 0);
        } else {
          right.normalize();
        }

        const moveDir = new THREE.Vector3();
        if (statePolicy.motion.kind === 'retreat_from_target') {
          moveDir.copy(forward).multiplyScalar(-1);
        } else if (statePolicy.motion.kind === 'strafe_left') {
          moveDir.copy(right).multiplyScalar(-1);
        } else {
          moveDir.copy(right);
        }

        currentPos.addScaledVector(moveDir, statePolicy.motion.speed * delta);
        setFacingYaw(group, currentPos, motionTarget);
        return true;
      };

      const movedByRelativePolicy = applyRelativeMotion();
      if (!movedByRelativePolicy && statePolicy.motion.kind === 'approach_target') {
        const dir = new THREE.Vector3().subVectors(anchorVec, currentPos);
        if (dir.lengthSq() > 1e-6) {
          dir.normalize();
          currentPos.addScaledVector(dir, delta * statePolicy.motion.speed);
          setFacingYaw(group, currentPos, anchorVec);
        }
      }

      if (statePolicy.hitWindow && actionRef.current && actionRef.current.action.isRunning()) {
        const action = actionRef.current.action as HitAwareAction;
        const clipDur = action.getClip().duration;
        const progress = clipDur > 0 ? action.time / clipDur : 0;
        if (progress >= statePolicy.hitWindow.start && progress <= statePolicy.hitWindow.end) {
          if (distToAnchor <= statePolicy.hitWindow.range && !action._hasHit) {
            action._hasHit = true;
            useFSMStore.getState().takeDamage('local', statePolicy.hitWindow.damage);
          }
        }
        if (progress > statePolicy.hitWindow.end + 0.05) {
          action._hasHit = false;
        }
      }

      // Clamp to arena
      if (currentPos.distanceTo(arenaCenter) > GAMEPLAY_RULES.arenaRadiusMeters) {
        currentPos
          .sub(arenaCenter)
          .normalize()
          .multiplyScalar(GAMEPLAY_RULES.arenaRadiusMeters)
          .add(arenaCenter);
      }

      // Body Collision Separation
      if (playerPos) {
         const distToPlayer = currentPos.distanceTo(playerPos);
         const minHitDistance = 0.8; // Avoid bodies fusing
         if (distToPlayer < minHitDistance) {
            if (distToPlayer < 0.001) {
               currentPos.x -= 0.05;
               currentPos.z += 0.05;
            } else {
               const pushDir = new THREE.Vector3().subVectors(currentPos, playerPos).normalize();
               const overlap = minHitDistance - distToPlayer;
               currentPos.add(pushDir.multiplyScalar(overlap * 0.5));
            }
         }
      }

      // State transition
      if (aiTimerRef.current >= aiDurationRef.current) {
         if (state !== 'FAINT' && state !== 'CELEBRATE') {
           applyAiState(chooseAiState(distToAnchor));
         }
      }

      // Keep enemy facing local robot (not camera) for stable combat readability.
      if (localRobotPos) {
        const toLocal = new THREE.Vector3().subVectors(localRobotPos, currentPos);
        toLocal.y = 0;
        if (toLocal.lengthSq() > 1e-6) {
          setFacingYaw(group, currentPos, localRobotPos);
        }
      }

      // Share position via FSM for local robot tracking
      useFSMStore.getState().setRemoteRobotPosition(currentPos.clone());
      prevEnemyHpRef.current = enemyHpNow;

    } else {
      // ── REMOTE SYNC LOOP ──
      if (!matchAlignmentReady) {
        playAction({ clip: 'Idle' }, 0.15);
        useFSMStore.getState().setRemoteRobotPosition(currentPos.clone());
        return;
      }
      const before = currentPos.distanceTo(targetRef.current);
      currentPos.lerp(targetRef.current, Math.min(1, delta * 8));
      if (localRobotPos) {
        setFacingYaw(group, currentPos, localRobotPos);
      } else {
        setFacingYaw(group, currentPos, targetRef.current);
      }

      const moving = before > 0.07;
      const syncedAction = resolveSyncedCharacterAction(syncedStateRef.current, moving);
      playAction(syncedAction, 0.15);
    }

    if (HEIGHT_DEBUG && typeof window !== 'undefined') {
      const now = performance.now();
      if (now - lastHeightEmitAtRef.current >= 250) {
        const bounds = heightBoundsRef.current.setFromObject(group);
        const minY = Number.isFinite(bounds.min.y) ? bounds.min.y : currentPos.y;
        const clearance = minY; // debug ground mesh is aligned to Y=0
        window.dispatchEvent(new CustomEvent('character_height_debug', {
          detail: {
            actor: 'remote',
            minY,
            groundY: 0,
            clearance,
            state: remoteDriven ? (syncedStateRef.current ?? 'UNKNOWN') : aiStateRef.current,
            modelType: opponentModelType,
            ts: Date.now(),
          },
        }));
        lastHeightEmitAtRef.current = now;
      }
    }
  });

  return (
    <group ref={groupRef} position={[1, 0, -1.5]}>
       {modelScene && (
         <group
           position={[
             0,
             modelBaseMinY !== null ? (-modelBaseMinY * 0.62) : -0.145,
             0,
            ]}
           scale={[0.62, 0.62, 0.62]}
         >
           <primitive object={modelScene} />
         </group>
       )}
    </group>
  );
};
