export interface UserProfile {
  playerName: string;
  totalMatches: number;
  aiMemorySummary: string;
}

export interface RobotStats {
  power: number;
  speed: number;
  vit: number;
}

export interface RobotPersonality {
  talkSkill: number;
  adlibSkill: number;
  tone: string;
}

export interface RobotNetwork {
  syncRate: number;
  unison?: number; // 団体戦用共鳴度 0-100
}

export interface CharacterDNA {
  version: "v1";
  seed: number;
  silhouette: "striker" | "tank" | "ace";
  finish: "matte" | "satin" | "gloss";
  paletteFamily: "ember" | "marine" | "forest" | "royal" | "obsidian" | "sunset";
  eyeGlow: string;
  scarLevel: number;
  glowIntensity: number;
  evolutionStage: number;
  battlePatina: "clean" | "worn" | "scarred" | "legend";
  materialType?: string;
  emblemUrl?: string;
  skinUrl?: string;
}

export interface RobotStatus {
  name?: string;        // Geminiが提案するロボット名
  material: string;     // "Wood" | "Metal" | "Resin"
  level: number;
  stats: RobotStats;
  personality: RobotPersonality;
  network: RobotNetwork;
  characterDna?: CharacterDNA;
}

/** フロントエンドからバックエンドへ送信するキャラクター生成リクエスト */
export interface RobotGenerationRequest {
  user_id: string;
  /** インカメラで撮影した顔写真（Base64 JPEG）。スキップ時はundefined */
  face_image_base64?: string;
  /** スキップ時にユーザーが入力したテキストプロンプト */
  preset_text?: string;
  /** フロントで選択した機体タイプ */
  model_type?: "A" | "B";
}

/** バックエンドがGemini Visionから生成したロボット初期パラメータ */
export interface RobotGenerationResult {
  name: string;         // suggestedName
  material: "Wood" | "Metal" | "Resin";
  stats: RobotStats;    // power / speed / vit
  personality: {
    talkSkill: number;
    adlibSkill: number;
    tone: string;
  };
  network: {
    syncRate: number;
    unison: number;
  };
  characterDna?: CharacterDNA;
}

export interface HighlightEvent {
  timestamp: string;
  description: string;
}

export type SessionMode = "match" | "training" | "walk";

export interface MatchLog {
  timestamp: string;
  result: "WIN" | "LOSE" | "DRAW";
  targetId?: string;
  highlightEvents: HighlightEvent[];
}

export interface WalkLog {
  sessionId?: string;
  timestamp: string;
  mode: "walk";
  startedAt?: string;
  endedAt?: string;
  routeSummary: string;
  foundItems: string[];
  proactiveAudioHighlights: string[];
  visionTriggers?: string[];
  syncRateBefore?: number;
  syncRateAfter?: number;
  aiComment?: string;
  highlightEvents: HighlightEvent[];
}

export interface TrainingLog {
  sessionId?: string;
  timestamp: string;
  result: "SUCCESS" | "FAILURE";
  mode?: "training";
  startedAt?: string;
  endedAt?: string;
  syncRateBefore?: number;
  syncRateAfter?: number;
  accuracyScore?: number;
  speedScore?: number;
  passionScore?: number;
  drillType?: string;
  accuracy?: number;
  speed?: number;
  passion?: number;
  retryCount?: number;
  highlights?: string[];
  aiComment?: string;
  highlightEvents: HighlightEvent[];
}
