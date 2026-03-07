import { create } from 'zustand';
import * as THREE from 'three';
import type { CharacterDNA } from '../../../shared/types/firestore';
import type { ModelTypeId } from '../constants/modelTypes';
import { DEFAULT_CHARACTER_DNA, normalizeCharacterDNA } from '../utils/characterDNA';

export type PlayMode = 'hub' | 'match' | 'training' | 'walk';
const MODEL_TYPE_STORAGE_KEY = 'plares_model_type';
const loadInitialModelType = (): ModelTypeId => {
  if (typeof window === 'undefined') return 'A';
  try {
    return localStorage.getItem(MODEL_TYPE_STORAGE_KEY) === 'B' ? 'B' : 'A';
  } catch {
    return 'A';
  }
};

export enum State {
  HOVERING = 'HOVERING',
  BASIC_ATTACK = 'BASIC_ATTACK',
  EVADE_TO_COVER = 'EVADE_TO_COVER',
  FLANKING_RIGHT = 'FLANKING_RIGHT',
  EMERGENCY_EVADE = 'EMERGENCY_EVADE',
  CASTING_SPECIAL = 'CASTING_SPECIAL',
  SUPER_SAIYAN = 'SUPER_SAIYAN',
  
  // New Combat States
  PUNCH = 'PUNCH',
  KICK = 'KICK',
  COMBO_PUNCH = 'COMBO_PUNCH',
  DODGE_LEFT = 'DODGE_LEFT',
  DODGE_RIGHT = 'DODGE_RIGHT',
  EVADE_BACK = 'EVADE_BACK',
  DAMAGE = 'DAMAGE',
  FAINT = 'FAINT',
  CELEBRATE = 'CELEBRATE',
  TAUNT = 'TAUNT',
  IDLE = 'IDLE',
  WALK = 'WALK',
  RUN = 'RUN',
  SUPER_DASH = 'SUPER_DASH',
  SHORYUKEN = 'SHORYUKEN',
  TORNADO_PUNCH = 'TORNADO_PUNCH',
  BEAM_CHARGE = 'BEAM_CHARGE',
  HEAVY_WALK = 'HEAVY_WALK',
  STAGGER_WALK = 'STAGGER_WALK',
  REJECT_ITEM = 'REJECT_ITEM',
}

interface RobotStats {
  power: number;
  speed: number;
  vit: number;
}

interface RobotMeta {
  name: string;
  material: 'Wood' | 'Metal' | 'Resin';
  tone: string;
}

interface FSMState {
  currentState: State;
  targetPosition: THREE.Vector3 | null;
  evadeTimeout: ReturnType<typeof setTimeout> | null;
  setEmergencyEvade: (localDir: THREE.Vector3, distanceMeters?: number) => void;
  setAICommand: (command: { action: string; target?: THREE.Vector3 }) => void;
  setCastingSpecial: () => void;
  resolveSpecialResult: (result: { verdict: 'critical' | 'miss' }) => void;
  updateBasicMovement: (position: THREE.Vector3) => void;
  clearEvadeTimeout: () => void;
  clearTargetState: () => void;
  // ── Item Rejection ──
  setRejectItem: () => void;
  // ── Robot stats from character generation pipeline ──
  robotStats: RobotStats;
  robotMeta: RobotMeta;
  robotDna: CharacterDNA;
  setRobotStats: (stats: RobotStats, meta: RobotMeta) => void;
  setRobotDna: (dna: CharacterDNA | null | undefined) => void;
  remoteRobotPosition: THREE.Vector3 | null;
  setRemoteRobotPosition: (pos: THREE.Vector3 | null) => void;
  localRobotPosition: THREE.Vector3 | null;
  setLocalRobotPosition: (pos: THREE.Vector3) => void;

  // ── Local Solo Play Combat State ──
  localHp: number;
  enemyHp: number;
  takeDamage: (target: 'local' | 'enemy', amount: number) => void;
  syncHp: (target: 'local' | 'enemy', newHp: number) => void;
  resetMatch: () => void;

  // ── Character Model Selection ──
  modelType: ModelTypeId;
  setModelType: (type: ModelTypeId) => void;
  enemyModelType: ModelTypeId;
  setEnemyModelType: (type: ModelTypeId) => void;
  enemyRobotDna: CharacterDNA;
  setEnemyRobotDna: (dna: CharacterDNA | null | undefined) => void;
  debugSetState: (nextState: State) => void;
  debugSetHp: (target: 'local' | 'enemy', value: number) => void;
  // ── Mode Management ──
  playMode: PlayMode;
  setPlayMode: (mode: PlayMode) => void;
  prioritySource: 'P1' | 'P2' | 'P3' | 'debug' | 'system';
  transitionLog: Array<{ ts: number; from: State; to: State; source: string }>;
}


export const useFSMStore = create<FSMState>((set, get) => ({
  currentState: State.HOVERING,
  targetPosition: null,
  evadeTimeout: null,
  robotStats: { power: 40, speed: 40, vit: 40 },
  robotMeta: { name: 'レスラーMk1', material: 'Wood', tone: 'balanced' },
  robotDna: DEFAULT_CHARACTER_DNA,
  remoteRobotPosition: null,
  localRobotPosition: null,

  localHp: 100,
  enemyHp: 100,

  playMode: 'hub',
  setPlayMode: (mode) => set((state) => {
    if (state.playMode === mode) return state;
    return { playMode: mode };
  }),

  modelType: loadInitialModelType(),
  enemyModelType: 'B',
  enemyRobotDna: { ...DEFAULT_CHARACTER_DNA, paletteFamily: 'ember', eyeGlow: '#FFB86E' },
  prioritySource: 'system' as const,
  transitionLog: [],
  setModelType: (type) => {
    try {
      localStorage.setItem(MODEL_TYPE_STORAGE_KEY, type);
    } catch {
      // noop
    }
    set({ modelType: type });
  },
  setEnemyModelType: (type) => set({ enemyModelType: type }),
  setEnemyRobotDna: (dna) => set({ enemyRobotDna: normalizeCharacterDNA(dna) ?? { ...DEFAULT_CHARACTER_DNA, paletteFamily: 'ember', eyeGlow: '#FFB86E' } }),
  debugSetState: (nextState) => {
    const prev = get().currentState;
    get().clearEvadeTimeout();
    const log = [...get().transitionLog, { ts: Date.now(), from: prev, to: nextState, source: 'debug' }].slice(-10);
    set({ currentState: nextState, targetPosition: null, prioritySource: 'debug', transitionLog: log });
  },
  debugSetHp: (target, value) => {
    const hp = Math.max(0, Math.min(100, Math.round(value)));
    if (target === 'local') {
      if (hp <= 0) {
        get().clearEvadeTimeout();
        set({ localHp: 0, currentState: State.FAINT, targetPosition: null });
        return;
      }
      set({ localHp: hp });
      return;
    }
    if (hp <= 0) {
      set({ enemyHp: 0 });
      return;
    }
    set({ enemyHp: hp });
  },

  takeDamage: (target, amount) =>
    set((state) => {
      const isLocal = target === 'local';
      if (isLocal && state.localHp <= 0) return {};
      if (!isLocal && state.enemyHp <= 0) return {};
      
      const newHp = Math.max(0, (isLocal ? state.localHp : state.enemyHp) - amount);
      get().syncHp(target, newHp);
      return {};
    }),

  syncHp: (target, newHp) =>
    set((state) => {
      const isLocal = target === 'local';
      
      // If no change or already fainted, ignore
      if (isLocal && (state.localHp === newHp || state.localHp <= 0)) return {};
      if (!isLocal && (state.enemyHp === newHp || state.enemyHp <= 0)) return {};

      // Only animate damage if HP decreased (skip for healing)
      const didTakeDamage = isLocal ? newHp < state.localHp : newHp < state.enemyHp;
      const update: Partial<FSMState> = isLocal ? { localHp: newHp } : { enemyHp: newHp };
      
      // If local robot dies, force FSM to FAINT and clear any pending evades.
      if (isLocal && newHp <= 0) {
         update.currentState = State.FAINT;
         update.localHp = 0;
         get().clearEvadeTimeout();
      }
      // Trigger celebrate for winner (if opponent dies) with a slight delay so opponent falls first.
      else if (!isLocal && newHp <= 0) {
         update.enemyHp = 0;
         setTimeout(() => {
           // Verify we haven't reset the match in the meantime
           if (useFSMStore.getState().enemyHp <= 0) {
             set({ currentState: State.CELEBRATE });
           }
         }, 2000);
      }
      // If we just took damage but didn't die, show the hit reaction
      else if (isLocal && didTakeDamage) {
         // Don't interrupt casting special or emergency evades unless it's a huge hit? 
         // For now, let's interrupt to show feedback, unless casting.
         if (state.currentState !== State.CASTING_SPECIAL) {
           update.currentState = State.DAMAGE;
           
           // Clear it back to HOVERING after the hit animation plays (~500ms)
           get().clearEvadeTimeout();
           const hitTimer = setTimeout(() => {
              set((s) => s.currentState === State.DAMAGE ? { currentState: State.HOVERING } : {});
           }, 500);
           update.evadeTimeout = hitTimer;
         }
      }

      return update;
    }),

  resetMatch: () => set({ localHp: 100, enemyHp: 100, currentState: State.HOVERING }),

  setRemoteRobotPosition: (pos) => set((state) => {
    const prev = state.remoteRobotPosition;
    if (!pos && !prev) return state;
    if (pos && prev && prev.distanceToSquared(pos) < 1e-8) return state;
    return { remoteRobotPosition: pos ? pos.clone() : null };
  }),
  setLocalRobotPosition: (pos) => set((state) => {
    const prev = state.localRobotPosition;
    if (prev && prev.distanceToSquared(pos) < 1e-8) return state;
    return { localRobotPosition: pos.clone() };
  }),
  setRobotStats: (stats, meta) => set({ robotStats: stats, robotMeta: meta }),
  setRobotDna: (dna) => set({ robotDna: normalizeCharacterDNA(dna) ?? DEFAULT_CHARACTER_DNA }),

  clearTargetState: () => set({ currentState: State.HOVERING, targetPosition: null }),

  clearEvadeTimeout: () => {
    const { evadeTimeout } = get();
    if (evadeTimeout) clearTimeout(evadeTimeout);
    set({ evadeTimeout: null });
  },

  // ── Item Rejection (P2 priority equivalent) ──
  setRejectItem: () => {
    const state = get();
    if (
      state.currentState === State.FAINT ||
      state.currentState === State.CELEBRATE ||
      state.currentState === State.EMERGENCY_EVADE ||
      state.currentState === State.CASTING_SPECIAL
    ) {
      return;
    }
    get().clearEvadeTimeout();
    const prev = state.currentState;
    const log = [...state.transitionLog, { ts: Date.now(), from: prev, to: State.REJECT_ITEM, source: 'item_rejection' }].slice(-10);
    const timer = setTimeout(() => {
      set((s) => s.currentState === State.REJECT_ITEM ? { currentState: State.HOVERING, targetPosition: null, evadeTimeout: null } : { evadeTimeout: null });
    }, 1500);
    set({ currentState: State.REJECT_ITEM, targetPosition: null, evadeTimeout: timer, prioritySource: 'P2', transitionLog: log });
  },

  // Priority 1: Emergency Evade from Voice Control
  setEmergencyEvade: (localDir, distanceMeters = 1.1) => {
    get().clearEvadeTimeout();

    const origin = get().localRobotPosition?.clone() ?? new THREE.Vector3(0, 0, -1);
    const dir = localDir.clone();
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }
    const target = origin.addScaledVector(dir, Math.max(0.2, distanceMeters));
    
    const timeoutMsg = setTimeout(() => {
      set((state) => {
        if (state.currentState === State.EMERGENCY_EVADE) {
          return { currentState: State.HOVERING, targetPosition: null, evadeTimeout: null };
        }
        return { evadeTimeout: null };
      });
    }, 1000);

    const prev = get().currentState;
    const log = [...get().transitionLog, { ts: Date.now(), from: prev, to: State.EMERGENCY_EVADE, source: 'P1' }].slice(-10);
    set({
      currentState: State.EMERGENCY_EVADE,
      targetPosition: target,
      evadeTimeout: timeoutMsg,
      prioritySource: 'P1',
      transitionLog: log,
    });
  },

  // Priority 2: JSON from Gemini
  setAICommand: (command) =>
    set((state) => {
      // Don't override Priority 1 or casting special
      if (
        state.currentState === State.FAINT ||
        state.currentState === State.CELEBRATE ||
        state.currentState === State.EMERGENCY_EVADE ||
        state.currentState === State.CASTING_SPECIAL
      ) {
        return state;
      }

      let nextState = State.HOVERING;
      if (command.action === 'take_cover') nextState = State.EVADE_TO_COVER;
      if (command.action === 'flank_right') nextState = State.FLANKING_RIGHT;
      if (command.action === 'casting_special') nextState = State.CASTING_SPECIAL;
      if (command.action === 'basic_attack') nextState = State.BASIC_ATTACK;

      let nextTarget = command.target ? command.target.clone() : null;
      if (!nextTarget && command.action === 'basic_attack') {
        nextTarget =
          state.remoteRobotPosition?.clone() ??
          state.localRobotPosition?.clone().add(new THREE.Vector3(0, 0, -1)) ??
          null;
      }

      const prev = state.currentState;
      const log = [...state.transitionLog, { ts: Date.now(), from: prev, to: nextState, source: 'P2' }].slice(-10);
      return {
        currentState: nextState,
        targetPosition: nextTarget,
        prioritySource: 'P2' as const,
        transitionLog: log,
      };
    }),

  setCastingSpecial: () => {
    const state = get();
    if (state.currentState === State.FAINT || state.currentState === State.CELEBRATE) {
      return;
    }
    get().clearEvadeTimeout();
    set({
      currentState: State.CASTING_SPECIAL,
      targetPosition: null,
    });
  },

  resolveSpecialResult: ({ verdict }) =>
    set((state) => {
      if (state.currentState !== State.CASTING_SPECIAL) {
        return state;
      }
      return {
        currentState: verdict === 'critical' ? State.PUNCH : State.HOVERING,
      };
    }),

  // Priority 3: Basic Updates
  updateBasicMovement: (position) =>
    set((state) => {
      if (
        state.currentState === State.FAINT ||
        state.currentState === State.CELEBRATE ||
        state.currentState === State.EMERGENCY_EVADE ||
        state.currentState === State.EVADE_TO_COVER ||
        state.currentState === State.FLANKING_RIGHT ||
        state.currentState === State.CASTING_SPECIAL
      ) {
        return state;
      }

      return {
        targetPosition: position,
      };
    }),
}));
