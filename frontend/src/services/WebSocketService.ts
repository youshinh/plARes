import type { GameEvent, SignalData, SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';

type MessageHandler = (data: WebRTCDataChannelPayload) => void;

/**
 * Singleton WebSocketService that manages the live connection to the backend
 * infrastructure (Agent 3 / bidi_stream.py). Dispatches typed game events and
 * sync data to registered handlers.
 */
class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private handlers: Set<MessageHandler> = new Set();
  private reconnectDelay = 2000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string = '';

  connect(url: string, userId: string) {
    this.url = url;
    this.userId = userId;
    this._open();
  }

  private _open() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    console.log(`[WS] Connecting to ${this.url} as ${this.userId}`);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
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
      console.warn('[WS] Disconnected – reconnecting in', this.reconnectDelay, 'ms');
      this.reconnectTimer = setTimeout(() => this._open(), this.reconnectDelay);
    };
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

  private _send(payload: WebRTCDataChannelPayload) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn('[WS] Cannot send – socket not open');
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export const wsService = new WebSocketService();
