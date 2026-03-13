import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { rtcService } from '../../services/WebRTCDataChannelService';
import { wsService } from '../../services/WebSocketService';
import { useArenaSyncStore } from '../../store/useArenaSyncStore';
import { State, useFSMStore, type PlayMode } from '../../store/useFSMStore';
import { GAMEPLAY_RULES } from '../../constants/gameplay';
import { PLAYER_ID, ROBOT_ID } from '../../utils/identity';
import {
  getCombatStatePolicy,
  resolveLocalCharacterAction,
  type CharacterActionSpec,
  type CharacterClipName,
} from '../../utils/characterAnimation';
import type { SyncData, WebRTCDataChannelPayload } from '../../../../shared/types/events';
import { GROUND_CLEARANCE_EPSILON, SPEED_EVADE, SPEED_NORMAL } from './constants';
import type {
  HitAwareAction,
  PlayedAction,
} from './useRobotAnimationController';
import { navMesh } from '../../utils/NavMeshGenerator';

type UseRobotFrameLoopArgs = {
  actionRef: MutableRefObject<PlayedAction | null>;
  bodyScale: number;
  clipGroundOffsetRef: MutableRefObject<Partial<Record<CharacterClipName, number>>>;
  currentState: State;
  groundBoundsRef: MutableRefObject<THREE.Box3>;
  groupRef: RefObject<THREE.Group>;
  heroOffsetY: number;
  lastAnimStateRef: MutableRefObject<State | null>;
  mixerRef: MutableRefObject<THREE.AnimationMixer | null>;
  modelGroupRef: RefObject<THREE.Group>;
  playAction: (spec: CharacterActionSpec, fadeDuration?: number, forceReplay?: boolean) => void;
  playMode: PlayMode;
  scarRoughnessBoost: number;
  targetPosition: THREE.Vector3 | null;
  worldScaleRef: MutableRefObject<THREE.Vector3>;
  attachmentVersion?: number;
};

const setFacingYaw = (group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) => {
  const dirX = to.x - from.x;
  const dirZ = to.z - from.z;
  const lenSq = (dirX * dirX) + (dirZ * dirZ);
  if (lenSq < 1e-8) return;
  group.rotation.y = Math.atan2(dirX, dirZ);
};

const updateWaypoints = (
  pos: THREE.Vector3,
  targetPosition: THREE.Vector3 | null,
  lastTargetRef: MutableRefObject<THREE.Vector3 | null>,
  waypointsRef: MutableRefObject<THREE.Vector3[]>,
) => {
  if (!targetPosition) return;
  if (lastTargetRef.current?.equals(targetPosition)) return;
  lastTargetRef.current = targetPosition.clone();
  waypointsRef.current = navMesh.findPath(pos.clone(), targetPosition);
};

const updatePathMovement = ({
  currentState,
  group,
  hoverTimerRef,
  playMode,
  pos,
  roamTimerRef,
  waypointsRef,
  delta,
}: {
  currentState: State;
  group: THREE.Group;
  hoverTimerRef: MutableRefObject<number>;
  playMode: PlayMode;
  pos: THREE.Vector3;
  roamTimerRef: MutableRefObject<number | null>;
  waypointsRef: MutableRefObject<THREE.Vector3[]>;
  delta: number;
}) => {
  const waypoints = waypointsRef.current;
  if (waypoints.length > 0) {
    const nextWp = waypoints[0];
    const dist = pos.distanceTo(nextWp);
    const speed = currentState === State.EMERGENCY_EVADE ? SPEED_EVADE : SPEED_NORMAL;

    if (dist < 0.05) {
      waypoints.shift();
      return;
    }

    const dir = new THREE.Vector3().subVectors(nextWp, pos).normalize();
    pos.addScaledVector(dir, Math.min(speed * delta, dist));
    setFacingYaw(group, pos, nextWp);
    return;
  }

  if (playMode !== 'hub' && currentState === State.HOVERING && navMesh.isReady()) {
    hoverTimerRef.current += delta;
    if (hoverTimerRef.current <= 3.0) return;

    hoverTimerRef.current = 0;
    const randomTarget = new THREE.Vector3(
      pos.x + ((Math.random() - 0.5) * 2.0),
      pos.y,
      pos.z + ((Math.random() - 0.5) * 2.0),
    );
    if (roamTimerRef.current) {
      clearTimeout(roamTimerRef.current);
    }
    roamTimerRef.current = window.setTimeout(() => {
      useFSMStore.getState().updateBasicMovement(randomTarget);
      roamTimerRef.current = null;
    }, 0);
  }
};

const clampToArena = (pos: THREE.Vector3) => {
  const localAnchor = useArenaSyncStore.getState().localCalibration?.point ?? { x: 0, y: 0, z: 0 };
  const arenaCenter = new THREE.Vector3(localAnchor.x, localAnchor.y, localAnchor.z);
  if (pos.distanceTo(arenaCenter) <= GAMEPLAY_RULES.arenaRadiusMeters) return;

  pos
    .sub(arenaCenter)
    .normalize()
    .multiplyScalar(GAMEPLAY_RULES.arenaRadiusMeters)
    .add(arenaCenter);
};

const updateAnimationAndGrounding = ({
  beforePos,
  clipGroundOffsetRef,
  currentState,
  groundBoundsRef,
  group,
  heroOffsetY,
  lastAnimStateRef,
  mixerRef,
  modelGroup,
  playAction,
  actionRef,
  worldScaleRef,
  delta,
}: {
  actionRef: MutableRefObject<PlayedAction | null>;
  beforePos: THREE.Vector3;
  clipGroundOffsetRef: MutableRefObject<Partial<Record<CharacterClipName, number>>>;
  currentState: State;
  groundBoundsRef: MutableRefObject<THREE.Box3>;
  group: THREE.Group;
  heroOffsetY: number;
  lastAnimStateRef: MutableRefObject<State | null>;
  mixerRef: MutableRefObject<THREE.AnimationMixer | null>;
  modelGroup: THREE.Group | null;
  playAction: (spec: CharacterActionSpec, fadeDuration?: number, forceReplay?: boolean) => void;
  worldScaleRef: MutableRefObject<THREE.Vector3>;
  delta: number;
}) => {
  mixerRef.current?.update(delta);

  const movedDistance = beforePos.distanceTo(group.position);
  const isMoving = movedDistance > 0.0004;
  const resolvedAction = resolveLocalCharacterAction(currentState, isMoving);
  const stateChanged = lastAnimStateRef.current !== currentState;
  playAction(resolvedAction, 0.15, stateChanged && resolvedAction.loopOnce === true);
  lastAnimStateRef.current = currentState;

  const activeClip = actionRef.current?.name;
  if (modelGroup && activeClip) {
    const parentScaleY = Math.max(1e-4, group.getWorldScale(worldScaleRef.current).y);
    let clipOffset = clipGroundOffsetRef.current[activeClip] ?? 0;
    modelGroup.position.y = heroOffsetY + clipOffset;
    const bounds = groundBoundsRef.current.setFromObject(modelGroup);
    if (Number.isFinite(bounds.min.y)) {
      const groundY = group.position.y;
      const clearance = bounds.min.y - groundY;
      if (Math.abs(clearance) > GROUND_CLEARANCE_EPSILON) {
        clipOffset -= clearance / parentScaleY;
        clipGroundOffsetRef.current[activeClip] = clipOffset;
        modelGroup.position.y = heroOffsetY + clipOffset;
      } else if (clipGroundOffsetRef.current[activeClip] === undefined) {
        clipGroundOffsetRef.current[activeClip] = clipOffset;
      }
    }
    return;
  }

  if (modelGroup) {
    modelGroup.position.y = heroOffsetY;
  }
};

const maybeFaceRemoteTarget = (group: THREE.Group, currentState: State, pos: THREE.Vector3) => {
  const remotePos = useFSMStore.getState().remoteRobotPosition;
  if (
    !remotePos ||
    currentState === State.EMERGENCY_EVADE ||
    currentState === State.EVADE_TO_COVER ||
    currentState === State.FLANKING_RIGHT
  ) {
    return remotePos;
  }

  setFacingYaw(group, pos, remotePos);
  return remotePos;
};

const processHitWindow = (
  currentState: State,
  actionRef: MutableRefObject<PlayedAction | null>,
  pos: THREE.Vector3,
  remotePos: THREE.Vector3 | null,
) => {
  const hitStatePolicy = getCombatStatePolicy(currentState, {
    fallbackState: 'HOVERING',
    source: 'local_hit_window',
  });
  if (!hitStatePolicy.hitWindow || !actionRef.current || !remotePos) return;

  const action = actionRef.current.action as HitAwareAction;
  if (!action.isRunning()) return;

  const clipDur = action.getClip().duration;
  const progress = clipDur > 0 ? action.time / clipDur : 0;
  if (progress < hitStatePolicy.hitWindow.start) {
    action._hasHit = false;
  }
  if (
    progress < hitStatePolicy.hitWindow.start ||
    progress > hitStatePolicy.hitWindow.end ||
    action._hasHit
  ) {
    return;
  }

  const distToEnemy = pos.distanceTo(remotePos);
  if (distToEnemy > hitStatePolicy.hitWindow.range) return;

  action._hasHit = true;

  // Apply damage to the enemy locally so solo/CPU battles work.
  // (The WS/RTC path below notifies the backend for authoritative tracking.)
  useFSMStore.getState().takeDamage('enemy', hitStatePolicy.hitWindow.damage);

  const hitPayload: WebRTCDataChannelPayload = {
    type: 'event',
    data: {
      event: 'hit_confirmed',
      user: PLAYER_ID,
      payload: { damage: hitStatePolicy.hitWindow.damage },
    } as unknown as never,
  };
  if (!rtcService.send(hitPayload)) {
    wsService.sendEvent(hitPayload.data as never);
  }
};

const applyCombatGlow = (materials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[], currentState: State, scarRoughnessBoost: number) => {
  const emissiveMap: Partial<Record<State, string>> = {
    [State.HOVERING]: '#000000',
    [State.BASIC_ATTACK]: '#661100',
    [State.EVADE_TO_COVER]: '#002244',
    [State.FLANKING_RIGHT]: '#114422',
    [State.EMERGENCY_EVADE]: '#444400',
    [State.CASTING_SPECIAL]: '#441100',
  };
  const emissiveColor = emissiveMap[currentState] ?? '#000000';
  const emissiveIntensity = currentState === State.HOVERING ? 0.0 : 0.55;

  for (const mat of materials) {
    if (mat.emissive && mat.emissiveIntensity < 1.2) {
      mat.emissive.set(emissiveColor);
      mat.emissiveIntensity = emissiveIntensity;
    }
    if (typeof mat.roughness === 'number') {
      const store = mat.userData as { baseRoughness?: number };
      if (typeof store.baseRoughness !== 'number') {
        store.baseRoughness = mat.roughness;
      }
      mat.roughness = Math.max(
        0.02,
        Math.min(0.98, store.baseRoughness + scarRoughnessBoost),
      );
    }
  }
};

const syncStorePosition = ({
  lastLocalStorePosRef,
  lastLocalStoreSyncAtRef,
  localStoreTimerRef,
  now,
  playMode,
  pos,
}: {
  lastLocalStorePosRef: MutableRefObject<THREE.Vector3>;
  lastLocalStoreSyncAtRef: MutableRefObject<number>;
  localStoreTimerRef: MutableRefObject<number | null>;
  now: number;
  playMode: PlayMode;
  pos: THREE.Vector3;
}) => {
  if (playMode !== 'match') return;
  if (
    now - lastLocalStoreSyncAtRef.current < 80 ||
    lastLocalStorePosRef.current.distanceToSquared(pos) <= 1e-6
  ) {
    return;
  }

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
};

const syncPeerPosition = ({
  currentState,
  delta,
  lastSyncAtRef,
  now,
  playMode,
  pos,
  prevPosRef,
}: {
  currentState: State;
  delta: number;
  lastSyncAtRef: MutableRefObject<number>;
  now: number;
  playMode: PlayMode;
  pos: THREE.Vector3;
  prevPosRef: MutableRefObject<THREE.Vector3>;
}) => {
  if (playMode !== 'match' || now - lastSyncAtRef.current < 50) return;

  const vel = new THREE.Vector3()
    .subVectors(pos, prevPosRef.current)
    .divideScalar(Math.max(delta, 0.0001));
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

  if (!rtcService.send(syncPayload)) {
    wsService.sendSync(syncData);
  }

  prevPosRef.current.copy(pos);
  lastSyncAtRef.current = now;
};

export const useRobotFrameLoop = ({
  actionRef,
  bodyScale,
  clipGroundOffsetRef,
  currentState,
  groundBoundsRef,
  groupRef,
  heroOffsetY,
  lastAnimStateRef,
  mixerRef,
  modelGroupRef,
  playAction,
  playMode,
  scarRoughnessBoost,
  targetPosition,
  worldScaleRef,
  attachmentVersion = 0,
}: UseRobotFrameLoopArgs) => {
  const waypointsRef = useRef<THREE.Vector3[]>([]);
  const lastTargetRef = useRef<THREE.Vector3 | null>(null);
  const lastSyncAtRef = useRef(0);
  const localStoreTimerRef = useRef<number | null>(null);
  const roamTimerRef = useRef<number | null>(null);
  const lastLocalStoreSyncAtRef = useRef(0);
  const lastLocalStorePosRef = useRef(new THREE.Vector3(0, 0, -1));
  const prevPosRef = useRef(new THREE.Vector3(0, 0, -1));
  const hoverTimerRef = useRef(0);
  const materialsCacheRef = useRef<(THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[]>([]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const materials: (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[] = [];
    group.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mat = (child as THREE.Mesh).material as
        | THREE.MeshStandardMaterial
        | THREE.MeshPhysicalMaterial;
      if (mat) {
        materials.push(mat);
      }
    });
    materialsCacheRef.current = materials;
  }, [groupRef, attachmentVersion]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    group.scale.setScalar(bodyScale);
    const pos = group.position;
    const beforePos = pos.clone();

    updateWaypoints(pos, targetPosition, lastTargetRef, waypointsRef);
    updatePathMovement({
      currentState,
      group,
      hoverTimerRef,
      playMode,
      pos,
      roamTimerRef,
      waypointsRef,
      delta,
    });
    clampToArena(pos);
    updateAnimationAndGrounding({
      actionRef,
      beforePos,
      clipGroundOffsetRef,
      currentState,
      groundBoundsRef,
      group,
      heroOffsetY,
      lastAnimStateRef,
      mixerRef,
      modelGroup: modelGroupRef.current,
      playAction,
      worldScaleRef,
      delta,
    });
    const remotePos = maybeFaceRemoteTarget(group, currentState, pos);
    processHitWindow(currentState, actionRef, pos, remotePos);
    applyCombatGlow(materialsCacheRef.current, currentState, scarRoughnessBoost);

    const now = performance.now();
    syncStorePosition({
      lastLocalStorePosRef,
      lastLocalStoreSyncAtRef,
      localStoreTimerRef,
      now,
      playMode,
      pos,
    });
    syncPeerPosition({
      currentState,
      delta,
      lastSyncAtRef,
      now,
      playMode,
      pos,
      prevPosRef,
    });
  });

  useEffect(() => {
    return () => {
      if (localStoreTimerRef.current) {
        clearTimeout(localStoreTimerRef.current);
        localStoreTimerRef.current = null;
      }
      if (roamTimerRef.current) {
        clearTimeout(roamTimerRef.current);
        roamTimerRef.current = null;
      }
    };
  }, []);
};
