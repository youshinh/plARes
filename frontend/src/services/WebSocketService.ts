import type { GameEvent, SignalData, SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { GAMEPLAY_RULES } from '../constants/gameplay';

type MessageHandler = (data: WebRTCDataChannelPayload) => void;

/**
 * Singleton WebSocketService that manages the live connection to the backend
 * infrastructure (Agent 3 / bidi_stream.py). Dispatches typed game events and
 * sync data to registered handlers.
 */
class WebSocketService {
  private ws: WebSocket | null = null;
  private baseUrl: string = '';
  private handlers: Set<MessageHandler> = new Set();
  private reconnectDelay = 2000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private userId: string = '';
  private roomId: string = 'default';
  private lang: string = 'en-US';
  private syncRate: number = 0.5;
  private shouldReconnect = false;

  connect(url: string, userId: string, roomId: string, lang: string, syncRate: number) {
    this.baseUrl = url;
    this.userId = userId;
    this.roomId = roomId;
    this.lang = lang;
    this.syncRate = Math.max(0, Math.min(1, syncRate));
    this.shouldReconnect = true;
    this._open();
  }

  private _buildUrl(): string {
    try {
      const built = new URL(this.baseUrl, window.location.href);
      built.searchParams.set('user_id', this.userId);
      built.searchParams.set('room_id', this.roomId);
      built.searchParams.set('lang', this.lang);
      built.searchParams.set('sync_rate', String(this.syncRate));
      return built.toString();
    } catch {
      const separator = this.baseUrl.includes('?') ? '&' : '?';
      return `${this.baseUrl}${separator}user_id=${encodeURIComponent(this.userId)}&room_id=${encodeURIComponent(this.roomId)}&lang=${encodeURIComponent(this.lang)}&sync_rate=${encodeURIComponent(String(this.syncRate))}`;
    }
  }

  private _open() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (!this.shouldReconnect) return;
    const wsUrl = this._buildUrl();
    console.log(`[WS] Connecting to ${wsUrl} as ${this.userId} room=${this.roomId}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.startHeartbeat();
    };

    this.ws.onmessage = (evt: MessageEvent) => {
      try {
        const payload: WebRTCDataChannelPayload = JSON.parse(evt.data);
        this.handlers.forEach(h => h(payload));
      } catch (e) {
        console.error('[WS] Failed to parse message', e);
      }
    };

    this.ws.onerror = (e) => console.error('[WS] Error', e);

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.shouldReconnect) return;
      console.warn('[WS] Disconnected – reconnecting in', this.reconnectDelay, 'ms');
      this.reconnectTimer = setTimeout(() => this._open(), this.reconnectDelay);
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.sendEvent({
      event: 'heartbeat',
      user: this.userId,
      payload: { ts: Date.now() },
    });
    this.heartbeatTimer = setInterval(() => {
      this.sendEvent({
        event: 'heartbeat',
        user: this.userId,
        payload: { ts: Date.now() },
      });
    }, GAMEPLAY_RULES.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Register a handler for inbound server messages */
  addHandler(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); }; // returns cleanup fn
  }

  /** Send position/velocity sync to opponent(s) */
  sendSync(data: SyncData) {
    this._send({ type: 'sync', data });
  }

  /** Send a game event (e.g. attack result) */
  sendEvent(event: GameEvent) {
    this._send({ type: 'event', data: event });
  }

  /** Send WebRTC signaling data over the shared game socket */
  sendSignal(signal: SignalData) {
    this._send({ type: 'signal', data: signal });
  }

  /** Ask backend to mint a Gemini Live ephemeral token for this user. */
  requestEphemeralToken(payload: Record<string, unknown>) {
    this.sendEvent({
      event: 'request_ephemeral_token',
      user: this.userId,
      payload,
    });
  }

  /** Ask backend to execute one Interactions API turn. */
  requestInteractionTurn(payload: Record<string, unknown>) {
    this.sendEvent({
      event: 'interaction_turn',
      user: this.userId,
      payload,
    });
  }

  private _send(payload: WebRTCDataChannelPayload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WS] Cannot send – socket not open');
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }
}

export const wsService = new WebSocketService();
