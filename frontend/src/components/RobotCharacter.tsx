import React, { useEffect, useRef } from 'react';
import { useFSMStore } from '../store/useFSMStore';
import * as THREE from 'three';
import { useRobotAssetBundle } from './robot/useRobotAssetBundle';
import { useRobotAnimationController } from './robot/useRobotAnimationController';
import { useRobotAppearance } from './robot/useRobotAppearance';
import { useRobotBoneScaling } from './robot/useRobotBoneScaling';
import { useAttachmentManager } from './robot/useAttachmentManager';
import { useRobotFrameLoop } from './robot/useRobotFrameLoop';

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
  const groupRef = useRef<THREE.Group>(null);
  const modelGroupRef = useRef<THREE.Group>(null);

  const currentState = useFSMStore(s => s.currentState);
  const targetPosition = useFSMStore(s => s.targetPosition);
  const robotStats = useFSMStore(s => s.robotStats);
  const robotMeta = useFSMStore(s => s.robotMeta);
  const robotDna = useFSMStore(s => s.robotDna);
  const modelType = useFSMStore(s => s.modelType);
  const playMode = useFSMStore(s => s.playMode);
  const localRobotPosition = useFSMStore(s => s.localRobotPosition);
  const attachments = useFSMStore(s => s.attachments);
  const { heroAnimations, heroBaseMinY, heroScene } = useRobotAssetBundle(modelType);
  const {
    actionRef,
    clipGroundOffsetRef,
    groundBoundsRef,
    lastAnimStateRef,
    mixerRef,
    playAction,
    worldScaleRef,
  } = useRobotAnimationController({ heroScene, heroAnimations });
  const { bodyScale, heroOffsetY, heroScale, scarRoughnessBoost } = useRobotAppearance({
    heroBaseMinY,
    heroScene,
    modelType,
    robotDna,
    robotMaterial: robotMeta.material,
    vit: robotStats.vit,
  });
  useRobotBoneScaling(heroScene, robotStats, robotDna);
  const { attachmentVersion } = useAttachmentManager(heroScene, attachments);
  useRobotFrameLoop({
    actionRef,
    attachmentVersion,
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
  });

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !localRobotPosition) return;
    if (group.position.distanceToSquared(localRobotPosition) < 1e-8) return;

    group.position.copy(localRobotPosition);
    if (playMode !== 'match') {
      group.rotation.set(0, 0, 0);
    }
  }, [localRobotPosition, playMode]);

  return (
    <group ref={groupRef} position={[0, 0, -1]} scale={[bodyScale, bodyScale, bodyScale]}>
      {heroScene && (
        <group ref={modelGroupRef} position={[0, heroOffsetY, 0]} scale={[heroScale, heroScale, heroScale]}>
          <primitive object={heroScene} />
        </group>
      )}
    </group>
  );
};
