import * as THREE from 'three';

export const CHARACTER_CLIP_NAMES = [
  'Idle',
  'Walking',
  'Running',
  'Jump',
  'Punch',
  'Kick',
  'Death',
  'Yes',
] as const;

export type CharacterClipName = (typeof CHARACTER_CLIP_NAMES)[number];

export interface CharacterActionSpec {
  clip: CharacterClipName;
  loopOnce?: boolean;
  speed?: number;
}

export type MotionPolicyKind =
  | 'none'
  | 'path'
  | 'approach_target'
  | 'retreat_from_target'
  | 'strafe_left'
  | 'strafe_right';

export interface MotionPolicy {
  kind: MotionPolicyKind;
  speed: number;
}

export interface HitWindowPolicy {
  start: number;
  end: number;
  range: number;
  damage: number;
}

export interface CombatStatePolicy {
  animation: CharacterActionSpec;
  movingClip?: CharacterClipName;
  duration: number;
  motion: MotionPolicy;
  lockMovement?: boolean;
  autoExitToHover?: boolean;
  hitWindow?: HitWindowPolicy;
}

interface ClipSource {
  target: CharacterClipName;
  aliases: string[];
}

const CLIP_SOURCES: ClipSource[] = [
  { target: 'Idle', aliases: ['Idle', 'Alert', 'Boxing_Practice'] },
  { target: 'Walking', aliases: ['Walking', 'Casual_Walk'] },
  { target: 'Running', aliases: ['Running', 'RunFast'] },
  { target: 'Jump', aliases: ['BeHit_FlyUp', 'Arise'] },
  { target: 'Punch', aliases: ['Skill_01'] },
  { target: 'Kick', aliases: ['Skill_03'] },
  { target: 'Death', aliases: ['Dead'] },
  { target: 'Yes', aliases: ['Boom_Dance', 'All_Night_Dance'] },
];

export const ONE_SHOT_CLIPS = new Set<CharacterClipName>(['Jump', 'Punch', 'Kick', 'Death']);

export const HOLD_AFTER_FINISH_CLIPS = new Set<CharacterClipName>(['Jump', 'Death']);

export const ATTACK_CLIPS = new Set<CharacterClipName>(['Punch', 'Kick']);

const WARNED_UNKNOWN_STATES = new Set<string>();

export const COMBAT_STATE_POLICY: Record<string, CombatStatePolicy> = {
  HOVERING: {
    animation: { clip: 'Idle' },
    movingClip: 'Walking',
    duration: Number.POSITIVE_INFINITY,
    motion: { kind: 'path', speed: 1.5 },
  },
  FLANKING_RIGHT: {
    animation: { clip: 'Walking' },
    duration: 1.2,
    motion: { kind: 'path', speed: 1.5 },
  },
  EMERGENCY_EVADE: {
    animation: { clip: 'Running', speed: 1.35 },
    duration: 1.0,
    motion: { kind: 'path', speed: 5.0 },
  },
  EVADE_TO_COVER: {
    animation: { clip: 'Running' },
    duration: 1.2,
    motion: { kind: 'path', speed: 1.5 },
  },
  BASIC_ATTACK: {
    animation: { clip: 'Punch', speed: 1.08 },
    movingClip: 'Running',
    duration: 1.0,
    motion: { kind: 'approach_target', speed: 1.5 },
  },
  CASTING_SPECIAL: {
    animation: { clip: 'Jump', loopOnce: true, speed: 0.9 },
    duration: 3.0,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
  },
  SUPER_SAIYAN: {
    animation: { clip: 'Jump', loopOnce: true, speed: 0.9 },
    duration: 1.2,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
  },
  PUNCH: {
    animation: { clip: 'Punch', loopOnce: true },
    duration: 0.8,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    hitWindow: { start: 0.35, end: 0.58, range: 1.0, damage: 10 },
  },
  KICK: {
    animation: { clip: 'Kick', loopOnce: true },
    duration: 1.0,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    hitWindow: { start: 0.4, end: 0.66, range: 1.1, damage: 10 },
  },
  COMBO_PUNCH: {
    animation: { clip: 'Punch', loopOnce: true, speed: 1.35 },
    duration: 1.4,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    hitWindow: { start: 0.28, end: 0.65, range: 1.12, damage: 12 },
  },
  DODGE_LEFT: {
    animation: { clip: 'Running', loopOnce: true, speed: 1.3 },
    duration: 0.6,
    motion: { kind: 'strafe_left', speed: 2.4 },
    autoExitToHover: true,
  },
  DODGE_RIGHT: {
    animation: { clip: 'Running', loopOnce: true, speed: 1.3 },
    duration: 0.6,
    motion: { kind: 'strafe_right', speed: 2.4 },
    autoExitToHover: true,
  },
  EVADE_BACK: {
    animation: { clip: 'Running', loopOnce: true, speed: -1.1 },
    duration: 0.8,
    motion: { kind: 'retreat_from_target', speed: 3.0 },
    autoExitToHover: true,
  },
  DAMAGE: {
    animation: { clip: 'Jump', loopOnce: true, speed: 1.4 },
    duration: 0.5,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    autoExitToHover: true,
  },
  FAINT: {
    animation: { clip: 'Death', loopOnce: true },
    duration: 999,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
  },
  CELEBRATE: {
    animation: { clip: 'Yes' },
    duration: 3.0,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
  },
  TAUNT: {
    animation: { clip: 'Yes', loopOnce: true, speed: 1.1 },
    duration: 1.5,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    autoExitToHover: true,
  },
  IDLE: {
    animation: { clip: 'Idle' },
    duration: 1.0,
    motion: { kind: 'none', speed: 0 },
  },
  WALK: {
    animation: { clip: 'Walking' },
    duration: 2.0,
    motion: { kind: 'approach_target', speed: 0.6 },
  },
  RUN: {
    animation: { clip: 'Running' },
    duration: 1.5,
    motion: { kind: 'approach_target', speed: 1.5 },
  },
  SUPER_DASH: {
    animation: { clip: 'Running', speed: 2.0 },
    duration: 0.8,
    motion: { kind: 'approach_target', speed: 3.0 },
  },
  SHORYUKEN: {
    animation: { clip: 'Jump', loopOnce: true, speed: 1.2 },
    duration: 1.2,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    hitWindow: { start: 0.3, end: 0.62, range: 1.05, damage: 12 },
  },
  TORNADO_PUNCH: {
    animation: { clip: 'Punch', loopOnce: true, speed: 1.85 },
    duration: 1.6,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
    hitWindow: { start: 0.24, end: 0.72, range: 1.2, damage: 14 },
  },
  BEAM_CHARGE: {
    animation: { clip: 'Jump', loopOnce: true, speed: 0.75 },
    duration: 1.2,
    motion: { kind: 'none', speed: 0 },
    lockMovement: true,
  },
};

function getFallbackPolicy(state: string): CombatStatePolicy {
  const fallback = COMBAT_STATE_POLICY[state];
  if (fallback) return fallback;
  return COMBAT_STATE_POLICY.IDLE;
}

export function getCombatStatePolicy(
  state: string | undefined,
  options?: { fallbackState?: string; source?: string },
): CombatStatePolicy {
  if (state && COMBAT_STATE_POLICY[state]) {
    return COMBAT_STATE_POLICY[state];
  }

  const source = options?.source ?? 'unknown';
  const fallbackState = options?.fallbackState ?? 'IDLE';
  const warnKey = `${source}:${state ?? 'undefined'}`;
  if (!WARNED_UNKNOWN_STATES.has(warnKey)) {
    WARNED_UNKNOWN_STATES.add(warnKey);
    console.warn(
      `[CombatStatePolicy] Unknown or unimplemented state "${state ?? 'undefined'}" selected at ${source}. Falling back to ${fallbackState}.`,
    );
  }
  return getFallbackPolicy(fallbackState);
}

function resolvePolicyAnimation(policy: CombatStatePolicy, isMovingInHover: boolean): CharacterActionSpec {
  if (isMovingInHover && policy.movingClip) {
    return { clip: policy.movingClip };
  }
  return policy.animation;
}

export function collectCharacterClips(source: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const clips: THREE.AnimationClip[] = [];
  const added = new Set<CharacterClipName>();

  for (const entry of CLIP_SOURCES) {
    const sourceClip = entry.aliases
      .map((alias) => THREE.AnimationClip.findByName(source, alias))
      .find((clip): clip is THREE.AnimationClip => Boolean(clip));

    if (!sourceClip || added.has(entry.target)) continue;

    const clip = sourceClip.clone();
    clip.name = entry.target;
    clips.push(clip);
    added.add(entry.target);
  }

  // Fallback: if no mapped clips exist, keep at least one idle-compatible clip.
  if (clips.length === 0 && source.length > 0) {
    const fallback = source[0].clone();
    fallback.name = 'Idle';
    clips.push(fallback);
  }

  return clips;
}

export function resolveLocalCharacterAction(state: string, isMovingInHover: boolean): CharacterActionSpec {
  const policy = getCombatStatePolicy(state, { fallbackState: 'HOVERING', source: 'local_animation' });
  return resolvePolicyAnimation(policy, isMovingInHover);
}

export function resolveAiCharacterAction(state: string): { action: CharacterActionSpec; duration: number } {
  const policy = getCombatStatePolicy(state, { fallbackState: 'IDLE', source: 'ai_animation' });
  return { action: resolvePolicyAnimation(policy, false), duration: policy.duration };
}

export function resolveSyncedCharacterAction(
  state: string | undefined,
  isMovingFallback: boolean,
): CharacterActionSpec {
  const fallback = isMovingFallback ? 'WALK' : 'IDLE';
  const policy = getCombatStatePolicy(state, { fallbackState: fallback, source: 'sync_animation' });
  return resolvePolicyAnimation(policy, isMovingFallback);
}

export function createActionKey(spec: CharacterActionSpec): string {
  return `${spec.clip}:${spec.loopOnce ? 'once' : 'loop'}:${spec.speed ?? 1}`;
}
