export type EventType =
  | "critical_hit"
  | "buff_applied"
  | "debuff_applied"
  | "item_dropped"
  | "milestone_reached"
  | "request_ephemeral_token"
  | "request_adk_status"
  | "request_battle_state_snapshot"
  | "request_tactical_recommendation"
  | "interaction_turn"
  | "match_end"
  | "winner_interview"
  | "heartbeat"
  | "match_paused"
  | "match_resumed"
  | "disconnect_tko"
  | "state_correction"
  | "special_ready"
  | "damage_applied"
  | "down_state"
  | "heat_state"
  | "persona_shift_request"
  | "walk_vision_trigger"
  | "dna_ab_feedback"
  | "proactive_line"
  | "reject_item"
  | "bgm_ready"
  | "request_ui_translations"
  | "incantation_submitted"
  | "hit_confirmed";

export interface GameEvent {
  event: EventType;
  user: string;
  target?: string;
  payload?: unknown;
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
  arenaFrameId?: string;
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
  action?: "equip" | "attach";
  mount_point?: "WEAPON_R" | "WEAPON_L" | "HEAD_ACCESSORY" | "BACKPACK";
  scale?: number;
}

export interface MemoryUpdate {
  user_id: string;
  timestamp: string;
  room_id: string;
  result: "WIN" | "LOSE" | "DRAW";
  total_matches: number;
  ai_memory_summary: string;
}
