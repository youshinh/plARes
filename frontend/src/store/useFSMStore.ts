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

interface FSMState {
  currentState: State;
  targetPosition: THREE.Vector3 | null;
  setEmergencyEvade: (direction: THREE.Vector3) => void;
  setAICommand: (command: { action: string; target?: THREE.Vector3 }) => void;
  updateBasicMovement: (position: THREE.Vector3) => void;
}

export const useFSMStore = create<FSMState>((set) => ({
  currentState: State.HOVERING,
  targetPosition: null,

  // Priority 1: Emergency Evade from Voice Control
  setEmergencyEvade: (direction) =>
    set({
      currentState: State.EMERGENCY_EVADE,
      targetPosition: direction,
    }),

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

      return {
        currentState: nextState,
        targetPosition: command.target || null,
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
