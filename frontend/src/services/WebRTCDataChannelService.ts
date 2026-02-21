import type { SignalData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { wsService } from './WebSocketService';

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

class WebRTCDataChannelService {
  private localId = '';
  private remoteId: string | null = null;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private offerInFlight = false;

  start(localId: string) {
    if (this.started) return;
    this.localId = localId;
    this.started = true;

    this.wsUnsubscribe = wsService.addHandler((payload) => {
      if (payload.type !== 'signal') return;
      this.onSignal(payload.data as SignalData).catch((err) => {
        console.error('[RTC] signal handling error', err);
      });
    });

    this.sendPresence();
    this.presenceTimer = setInterval(() => {
      if (!this.isOpen()) this.sendPresence();
    }, 4000);
  }

  stop() {
    this.started = false;
    this.wsUnsubscribe?.();
    this.wsUnsubscribe = null;

    if (this.presenceTimer) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }

    this.channel?.close();
    this.channel = null;
    this.pc?.close();
    this.pc = null;
    this.remoteId = null;
    this.offerInFlight = false;
  }

  isOpen(): boolean {
    return !!this.channel && this.channel.readyState === 'open';
  }

  send(payload: WebRTCDataChannelPayload): boolean {
    if (!this.isOpen() || !this.channel) return false;
    this.channel.send(JSON.stringify(payload));
    return true;
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.pc) return this.pc;

    const pc = new RTCPeerConnection(STUN_CONFIG);
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      wsService.sendSignal({
        kind: 'ice',
        from: this.localId,
        to: this.remoteId ?? undefined,
        candidate: event.candidate.toJSON(),
      });
    };

    pc.ondatachannel = (event) => {
      this.attachDataChannel(event.channel);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.channel = null;
      }
    };

    return pc;
  }

  private attachDataChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => {
      console.log('[RTC] data channel open');
    };
    channel.onclose = () => {
      console.log('[RTC] data channel closed');
    };
    channel.onerror = (err) => {
      console.error('[RTC] data channel error', err);
    };
    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebRTCDataChannelPayload;
        window.dispatchEvent(new CustomEvent('webrtc_payload', { detail: payload }));
      } catch (err) {
        console.error('[RTC] bad payload', err);
      }
    };
  }

  private sendPresence() {
    wsService.sendSignal({ kind: 'presence', from: this.localId });
  }

  private async createAndSendOffer(targetId: string) {
    if (this.offerInFlight) return;
    this.offerInFlight = true;
    try {
      const pc = this.ensurePeerConnection();
      this.remoteId = targetId;

      if (!this.channel) {
        this.attachDataChannel(pc.createDataChannel('plares-sync', { ordered: false }));
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
        wsService.sendSignal({
          kind: 'offer',
          from: this.localId,
          to: targetId,
          sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp ?? '' },
        });
      }
    } finally {
      this.offerInFlight = false;
    }
  }

  private async onSignal(signal: SignalData) {
    if (!this.started) return;
    if (!signal?.from || signal.from === this.localId) return;
    if (signal.to && signal.to !== this.localId) return;

    this.remoteId = signal.from;
    const pc = this.ensurePeerConnection();

    if (signal.kind === 'presence') {
      // deterministic offerer to avoid glare: lexicographically smaller ID starts offer
      if (this.localId < signal.from && !this.isOpen()) {
        await this.createAndSendOffer(signal.from);
      }
      return;
    }

    if (signal.kind === 'offer' && signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (pc.localDescription) {
        wsService.sendSignal({
          kind: 'answer',
          from: this.localId,
          to: signal.from,
          sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp ?? '' },
        });
      }
      return;
    }

    if (signal.kind === 'answer' && signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      return;
    }

    if (signal.kind === 'ice' && signal.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.warn('[RTC] failed to add ICE candidate', err);
      }
    }
  }
}

export const rtcService = new WebRTCDataChannelService();
