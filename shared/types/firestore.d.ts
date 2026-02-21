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
}

export interface RobotStatus {
  material: string;
  level: number;
  stats: RobotStats;
  personality: RobotPersonality;
  network: RobotNetwork;
}

export interface HighlightEvent {
  timestamp: string;
  description: string;
}

export interface MatchLog {
  timestamp: string;
  result: "WIN" | "LOSE" | "DRAW";
  targetId?: string;
  highlightEvents: HighlightEvent[];
}

export interface TrainingLog {
  timestamp: string;
  result: "SUCCESS" | "FAILURE";
  highlightEvents: HighlightEvent[];
}
