import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  HOLD_AFTER_FINISH_CLIPS,
  ONE_SHOT_CLIPS,
  createActionKey,
  type CharacterActionSpec,
  type CharacterClipName,
} from '../../utils/characterAnimation';
import { State } from '../../store/useFSMStore';

export type PlayedAction = {
  key: string;
  name: CharacterClipName;
  action: THREE.AnimationAction;
};

export type HitAwareAction = THREE.AnimationAction & { _hasHit?: boolean };

type UseRobotAnimationControllerArgs = {
  heroScene: THREE.Group | null;
  heroAnimations: THREE.AnimationClip[];
};

export const useRobotAnimationController = ({
  heroScene,
  heroAnimations,
}: UseRobotAnimationControllerArgs) => {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<PlayedAction | null>(null);
  const lastAnimStateRef = useRef<State | null>(null);
  const clipGroundOffsetRef = useRef<Partial<Record<CharacterClipName, number>>>({});
  const groundBoundsRef = useRef(new THREE.Box3());
  const worldScaleRef = useRef(new THREE.Vector3(1, 1, 1));

  useEffect(() => {
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
  }, [heroAnimations, heroScene]);

  const playAction = useCallback(
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

  return {
    actionRef,
    clipGroundOffsetRef,
    groundBoundsRef,
    lastAnimStateRef,
    mixerRef,
    playAction,
    worldScaleRef,
  };
};
