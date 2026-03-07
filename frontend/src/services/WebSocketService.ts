import type { GameEvent, SignalData, SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { GAMEPLAY_RULES } from '../constants/gameplay';

type MessageHandler = (data: WebRTCDataChannelPayload) => void;

/**
 * Shared game websocket for gameplay events, sync, signaling, and lightweight
 * backend-assisted GenAI requests such as `interaction_turn` and token minting.
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
  private intentionalClose = false;
  private pendingQueue: WebRTCDataChannelPayload[] = [];
  private pendingSync: SyncData | null = null;
  private readonly maxPendingQueue = 128;
  private lastQueueWarnAt = 0;
  private readonly queueWarnIntervalMs = 3000;

  connect(url: string, userId: string, roomId: string, lang: string, syncRate: number) {
    this.baseUrl = url;
    this.userId = userId;
    this.roomId = roomId;
    this.lang = lang;
    this.syncRate = Math.max(0, Math.min(1, syncRate));
    this.shouldReconnect = true;
    this.intentionalClose = false;
    this._open();
  }

  private emitStatus(detail: { connected: boolean; status: string; message: string }) {
    window.dispatchEvent(new CustomEvent('plares_ws_status', { detail }));
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
    if (this.ws?.readyState === WebSocket.CONNECTING) return;
    if (!this.shouldReconnect) return;
    const wsUrl = this._buildUrl();
    console.log(`[WS] Connecting to ${wsUrl} as ${this.userId} room=${this.roomId}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.flushPendingQueue();
      this.startHeartbeat();
      this.emitStatus({ connected: true, status: 'open', message: 'Game socket connected' });
    };

    this.ws.onmessage = (evt: MessageEvent) => {
      try {
        const payload: WebRTCDataChannelPayload = JSON.parse(evt.data);
        // Defer handler execution to avoid React state updates during render.
        const handlers = Array.from(this.handlers);
        window.setTimeout(() => {
          handlers.forEach(h => h(payload));
        }, 0);
      } catch (e) {
        console.error('[WS] Failed to parse message', e);
      }
    };

    this.ws.onerror = (e) => {
      if (!this.shouldReconnect || this.intentionalClose) return;
      console.error('[WS] Error', e);
      this.emitStatus({ connected: false, status: 'error', message: 'Game socket error' });
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      const wasIntentional = this.intentionalClose || !this.shouldReconnect;
      this.intentionalClose = false;
      if (wasIntentional) {
        this.emitStatus({ connected: false, status: 'closed', message: 'Game socket closed' });
        return;
      }
      console.warn('[WS] Disconnected – reconnecting in', this.reconnectDelay, 'ms');
      this.emitStatus({ connected: false, status: 'reconnecting', message: 'Game socket reconnecting' });
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send({ type: 'sync', data });
      return;
    }
    // Sync is high-frequency; keep only the latest frame until socket opens.
    this.pendingSync = data;
  }

  /** Send a game event (e.g. attack result) */
  sendEvent(event: GameEvent) {
    this._send({ type: 'event', data: event });
  }

  /** Send WebRTC signaling data over the shared game socket */
  sendSignal(signal: SignalData) {
    this._send({ type: 'signal', data: signal });
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
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

  /** Ask backend for current ADK live availability. */
  requestAdkStatus(payload: Record<string, unknown> = {}) {
    this.sendEvent({
      event: 'request_adk_status',
      user: this.userId,
      payload,
    });
  }

  private _send(payload: WebRTCDataChannelPayload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      if (this.pendingQueue.length >= this.maxPendingQueue) {
        this.pendingQueue.shift();
      }
      this.pendingQueue.push(payload);
      const now = Date.now();
      if (now - this.lastQueueWarnAt >= this.queueWarnIntervalMs) {
        this.lastQueueWarnAt = now;
        console.warn(`[WS] Queueing payload – socket not open (queued=${this.pendingQueue.length})`);
      }
    }
  }

  private flushPendingQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queue = this.pendingQueue.splice(0);
    for (const payload of queue) {
      this.ws.send(JSON.stringify(payload));
    }
    if (this.pendingSync) {
      this.ws.send(JSON.stringify({ type: 'sync', data: this.pendingSync }));
      this.pendingSync = null;
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.pendingQueue = [];
    this.pendingSync = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.emitStatus({ connected: false, status: 'closed', message: 'Game socket closed' });
  }
}

export const wsService = new WebSocketService();
