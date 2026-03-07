import { useMemo } from 'react';

export type LiveResponsibility =
  | 'conversation'
  | 'battle_coaching'
  | 'voice_attack_scoring'
  | 'commentary'
  | 'vision_trigger';

export type LiveRoute =
  | 'browser_direct'
  | 'backend_interaction'
  | 'audio_ws'
  | 'adk_live_ws'
  | 'game_event_ws';

export type LivePolicyPhase = 'current' | 'target';

export type LiveRouteDecision = {
  primary: LiveRoute;
  fallback?: LiveRoute;
  note: string;
};

export const CURRENT_LIVE_ROUTE_POLICY: Record<LiveResponsibility, LiveRouteDecision> = {
  conversation: {
    primary: 'browser_direct',
    note: 'Current production conversation uses browser direct Gemini Live.',
  },
  battle_coaching: {
    primary: 'backend_interaction',
    note: 'Current tactical guidance uses interaction_turn over /ws/game.',
  },
  voice_attack_scoring: {
    primary: 'audio_ws',
    note: 'Voice attack scoring stays on /ws/audio.',
  },
  commentary: {
    primary: 'browser_direct',
    fallback: 'backend_interaction',
    note: 'Short commentary prefers browser direct live with backend interaction fallback.',
  },
  vision_trigger: {
    primary: 'game_event_ws',
    note: 'Walk vision trigger is currently a /ws/game event.',
  },
};

export const TARGET_LIVE_ROUTE_POLICY: Record<LiveResponsibility, LiveRouteDecision> = {
  conversation: {
    primary: 'browser_direct',
    fallback: 'adk_live_ws',
    note: 'Keep browser direct as the low-latency path, use ADK live as fallback.',
  },
  battle_coaching: {
    primary: 'adk_live_ws',
    fallback: 'backend_interaction',
    note: 'ADK live becomes the primary tactical route in Phase 2.',
  },
  voice_attack_scoring: {
    primary: 'audio_ws',
    note: 'Voice scoring remains isolated on /ws/audio.',
  },
  commentary: {
    primary: 'browser_direct',
    fallback: 'backend_interaction',
    note: 'Commentary remains latency-first.',
  },
  vision_trigger: {
    primary: 'game_event_ws',
    fallback: 'backend_interaction',
    note: 'Vision trigger can stay on /ws/game even after Phase 2.',
  },
};

export const resolveLiveRoute = (
  responsibility: LiveResponsibility,
  phase: LivePolicyPhase = 'current',
): LiveRouteDecision =>
  (phase === 'target' ? TARGET_LIVE_ROUTE_POLICY : CURRENT_LIVE_ROUTE_POLICY)[responsibility];

export const useLiveRouteSelector = (phase: LivePolicyPhase = 'current') => {
  return useMemo(() => {
    const policy = phase === 'target' ? TARGET_LIVE_ROUTE_POLICY : CURRENT_LIVE_ROUTE_POLICY;
    return {
      phase,
      policy,
      resolve: (responsibility: LiveResponsibility) => policy[responsibility],
    };
  }, [phase]);
};
