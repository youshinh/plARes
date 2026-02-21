import { create } from 'zustand';
import * as THREE from 'three';

export enum State {
  HOVERING = 'HOVERING',
  BASIC_ATTACK = 'BASIC_ATTACK',
  EVADE_TO_COVER = 'EVADE_TO_COVER',
  FLANKING_RIGHT = 'FLANKING_RIGHT',
  EMERGENCY_EVADE = 'EMERGENCY_EVADE',
  CASTING_SPECIAL = 'CASTING_SPECIAL',
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
  setEmergencyEvade: (direction: THREE.Vector3) => void;
  setAICommand: (command: { action: string; target?: THREE.Vector3 }) => void;
  setCastingSpecial: () => void;
  resolveSpecialResult: (result: { verdict: 'critical' | 'miss' }) => void;
  updateBasicMovement: (position: THREE.Vector3) => void;
  clearEvadeTimeout: () => void;
  activeTextureUrl: string | null;
  setTexture: (url: string | null) => void;
  // ── Robot stats from character generation pipeline ──
  robotStats: RobotStats;
  robotMeta: RobotMeta;
  setRobotStats: (stats: RobotStats, meta: RobotMeta) => void;
}


export const useFSMStore = create<FSMState>((set, get) => ({
  currentState: State.HOVERING,
  targetPosition: null,
  evadeTimeout: null,
  activeTextureUrl: null,
  robotStats: { power: 40, speed: 40, vit: 40 },
  robotMeta: { name: 'レスラーMk1', material: 'Wood', tone: 'balanced' },

  setRobotStats: (stats, meta) => set({ robotStats: stats, robotMeta: meta }),

  setTexture: (url) => set({ activeTextureUrl: url }),


  clearEvadeTimeout: () => {
    const { evadeTimeout } = get();
    if (evadeTimeout) clearTimeout(evadeTimeout);
    set({ evadeTimeout: null });
  },

  // Priority 1: Emergency Evade from Voice Control
  setEmergencyEvade: (direction) => {
    get().clearEvadeTimeout();
    
    const timeoutMsg = setTimeout(() => {
      set((state) => {
        if (state.currentState === State.EMERGENCY_EVADE) {
          return { currentState: State.HOVERING, targetPosition: null, evadeTimeout: null };
        }
        return { evadeTimeout: null };
      });
    }, 1000);

    set({
      currentState: State.EMERGENCY_EVADE,
      targetPosition: direction,
      evadeTimeout: timeoutMsg,
    });
  },

  // Priority 2: JSON from Gemini
  setAICommand: (command) =>
    set((state) => {
      // Don't override Priority 1 or casting special
      if (
        state.currentState === State.EMERGENCY_EVADE ||
        state.currentState === State.CASTING_SPECIAL
      ) {
        return state;
      }

      let nextState = State.HOVERING;
      if (command.action === 'take_cover') nextState = State.EVADE_TO_COVER;
      if (command.action === 'flank_right') nextState = State.FLANKING_RIGHT;
      if (command.action === 'casting_special') nextState = State.CASTING_SPECIAL;

      return {
        currentState: nextState,
        targetPosition: command.target || null,
      };
    }),

  setCastingSpecial: () => {
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
        currentState: verdict === 'critical' ? State.BASIC_ATTACK : State.HOVERING,
      };
    }),

  // Priority 3: Basic Updates
  updateBasicMovement: (position) =>
    set((state) => {
      if (
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
