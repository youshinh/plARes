export type EventType = "critical_hit" | "buff_applied" | "debuff_applied" | "item_dropped" | "milestone_reached";

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
