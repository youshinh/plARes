export type EventType =
  | "critical_hit"
  | "buff_applied"
  | "debuff_applied"
  | "item_dropped"
  | "milestone_reached"
  | "request_ephemeral_token"
  | "interaction_turn"
  | "match_end";

export interface GameEvent {
  event: EventType;
  user: string;
  target?: string;
  payload?: any;
}

export interface Coordinates {
  x: number;
  y: number;
  z: number;
}

export interface Vector {
  x: number;
  y: number;
  z: number;
}

export interface SyncData {
  userId: string;
  robotId: string;
  position: Coordinates;
  velocity: Vector;
  timestamp: number;
  action?: string; // e.g., "attack", "guard", "dodge"
}

export interface SignalData {
  kind: "presence" | "offer" | "answer" | "ice" | "roster";
  from: string;
  to?: string;
  peers?: string[];
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface WebRTCDataChannelPayload {
  type: "sync" | "event" | "signal";
  data: SyncData | GameEvent | SignalData;
}

export interface FusedItem {
  requested_by: string;
  concept: string;
  texture_url: string;
}

export interface MemoryUpdate {
  user_id: string;
  timestamp: string;
  room_id: string;
  result: "WIN" | "LOSE" | "DRAW";
  total_matches: number;
  ai_memory_summary: string;
}
