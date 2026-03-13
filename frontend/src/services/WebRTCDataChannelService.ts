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
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private offerInFlight = false;

  private emitPeerState() {
    window.dispatchEvent(new CustomEvent('webrtc_peer_state', {
      detail: { hasPeer: !!this.remoteId, remoteId: this.remoteId },
    }));
  }

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

    if (wsService.isConnected()) {
      this.sendPresence();
    }
    this.emitPeerState();
    this.presenceTimer = setInterval(() => {
      if (!this.isOpen() && wsService.isConnected()) {
        this.sendPresence();
      }
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
    this.stopLocalTracks();
    this.localStream = null;
    this.remoteStream = null;
    this.pc?.close();
    this.pc = null;
    this.remoteId = null;
    this.offerInFlight = false;
    this.emitPeerState();
  }

  isOpen(): boolean {
    return !!this.channel && this.channel.readyState === 'open';
  }

  send(payload: WebRTCDataChannelPayload): boolean {
    if (!this.isOpen() || !this.channel) return false;
    this.channel.send(JSON.stringify(payload));
    return true;
  }

  sendNavMesh(points: { x: number; y: number; z: number }[]): boolean {
    if (!this.isOpen() || !this.channel) return false;
    // Chunking could be needed if payload is too large, but for now we attempt to send as a single payload.
    // If it exceeds RTCDataChannel max message size (typically 16-64KB depending on browser), 
    // it will throw. We wrap in try-catch to avoid crashing the app.
    try {
      this.channel.send(JSON.stringify({
        type: 'navmesh',
        data: points,
      }));
      return true;
    } catch (err) {
      console.warn('[RTC] Failed to send navmesh (possibly too large)', err);
      return false;
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getRemotePeerId(): string | null {
    return this.remoteId;
  }

  async enableMedia(options: { audio?: boolean; video?: boolean } = { audio: true, video: true }) {
    const audio = options.audio ?? true;
    const video = options.video ?? true;

    if (!audio && !video) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[RTC] getUserMedia not available (requires HTTPS or localhost). Cannot enable media.');
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    this.stopLocalTracks();
    this.localStream = stream;

    const pc = this.ensurePeerConnection();
    this.attachLocalTracks(pc);

    if (this.remoteId && pc.signalingState === 'stable') {
      await this.createAndSendOffer(this.remoteId);
    }
  }

  async disableMedia() {
    this.stopLocalTracks();
    this.localStream = null;

    if (this.pc) {
      for (const sender of this.pc.getSenders()) {
        if (sender.track && (sender.track.kind === 'audio' || sender.track.kind === 'video')) {
          this.pc.removeTrack(sender);
        }
      }
      if (this.remoteId && this.pc.signalingState === 'stable') {
        await this.createAndSendOffer(this.remoteId);
      }
    }
  }

  private stopLocalTracks() {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      track.stop();
    }
  }

  private resetPeerConnection() {
    this.channel?.close();
    this.channel = null;
    this.pc?.close();
    this.pc = null;
    this.remoteId = null;
    this.offerInFlight = false;
    this.emitPeerState();
  }

  private pickRemotePeer(peers: string[]): string | null {
    const candidates = peers.filter(p => p !== this.localId).sort();
    return candidates.length > 0 ? candidates[0] : null;
  }

  private attachLocalTracks(pc: RTCPeerConnection) {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      const already = pc.getSenders().some(s => s.track?.id === track.id);
      if (!already) {
        pc.addTrack(track, this.localStream);
      }
    }
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

    pc.ontrack = (event) => {
      this.remoteStream = event.streams[0] ?? this.remoteStream ?? new MediaStream([event.track]);
      window.dispatchEvent(
        new CustomEvent('webrtc_remote_stream', { detail: { stream: this.remoteStream } })
      );
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.channel = null;
      }
    };

    this.attachLocalTracks(pc);
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
    if (!wsService.isConnected()) return;
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

    if (signal.kind === 'roster' && Array.isArray(signal.peers)) {
      const nextRemote = this.pickRemotePeer(signal.peers);
      if (!nextRemote) {
        this.resetPeerConnection();
        return;
      }

      if (this.remoteId && this.remoteId !== nextRemote) {
        this.resetPeerConnection();
      }
      this.remoteId = nextRemote;
      this.emitPeerState();
      if (!this.isOpen() && this.localId < this.remoteId) {
        await this.createAndSendOffer(this.remoteId);
      } else {
        this.sendPresence();
      }
      return;
    }

    if (this.remoteId && signal.from !== this.remoteId) {
      return;
    }
    if (!this.remoteId) {
      this.remoteId = signal.from;
      this.emitPeerState();
    }
    const pc = this.ensurePeerConnection();

    if (signal.kind === 'presence') {
      // deterministic offerer to avoid glare: lexicographically smaller ID starts offer
      if (this.localId < signal.from && !this.isOpen() && this.remoteId === signal.from) {
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
