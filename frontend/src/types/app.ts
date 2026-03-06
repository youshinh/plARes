import type { CharacterDNA } from '../../../shared/types/firestore';

export type AppPhase = 'lang' | 'scan' | 'summon' | 'main';
export type ArSupportState = 'checking' | 'supported' | 'unsupported';
export type ScanState = 'idle' | 'searching' | 'tracking' | 'ready' | 'unsupported';

export type ModeSession = {
  id: string;
  startedAt: string;
};

export type BattleUiState = {
  hp: number;
  maxHp: number;
  opponentHp: number;
  opponentMaxHp: number;
  exGauge: number;
  specialReady: boolean;
  heatActive: boolean;
};

export type RouteProgress = {
  walk: number;
  training: number;
  battle: number;
};

export type ProfileInfo = {
  totalMatches: number;
  totalTrainingSessions: number;
  totalWalkSessions: number;
  tone: string;
  syncRate: number;
  storageBackend: string;
  memorySummary: string;
  recentLogs: Array<{
    timestamp: string;
    roomId: string;
    result: string;
    criticalHits: number;
    misses: number;
  }>;
};

export type LiveDebugInfo = {
  tokenName: string;
  resumeHandle: string;
  interactionId: string;
  interactionText: string;
};

export type DnaAbFeedbackPayload = {
  choice: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  note: string;
  variantA: CharacterDNA;
  variantB: CharacterDNA;
};

export type UiText = Record<string, string>;
