import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';

type LiveStatusDetail = {
  connected: boolean;
  message: string;
};

type LiveResumptionDetail = {
  handle: string;
  resumable: boolean;
  lastConsumedClientMessageIndex: string;
};

const dispatchStatus = (detail: LiveStatusDetail) => {
  window.dispatchEvent(new CustomEvent('gemini_live_status', { detail }));
};

const dispatchTranscript = (text: string) => {
  window.dispatchEvent(new CustomEvent('gemini_live_transcript', { detail: { text } }));
};

const dispatchResumption = (detail: LiveResumptionDetail) => {
  window.dispatchEvent(new CustomEvent('gemini_live_resumption', { detail }));
};

const dispatchMicState = (active: boolean) => {
  window.dispatchEvent(new CustomEvent('gemini_live_mic_state', { detail: { active } }));
};

const dispatchError = (message: string) => {
  window.dispatchEvent(new CustomEvent('gemini_live_error', { detail: { message } }));
};

const normalizeModel = (raw: string) => {
  const model = (raw || 'gemini-2.5-flash-native-audio-preview-12-2025').trim();
  return model.startsWith('models/') ? model.slice(7) : model;
};

export class GeminiLiveService {
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private tokenName = '';
  private model = 'gemini-2.5-flash-native-audio-preview-12-2025';
  private resumeHandle = '';
  private captureStream: MediaStream | null = null;
  private captureContext: AudioContext | null = null;
  private captureProcessor: ScriptProcessorNode | null = null;
  private captureSinkGain: GainNode | null = null;
  private playbackContext: AudioContext | null = null;
  private playbackCursor = 0;
  private micActive = false;
  private goAwayTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnecting = false;

  isConnected(): boolean {
    return this.session !== null;
  }

  isMicActive(): boolean {
    return this.micActive;
  }

  getResumeHandle(): string {
    return this.resumeHandle;
  }

  async connect(params: { tokenName: string; model?: string }) {
    if (this.session) return;
    this.tokenName = params.tokenName;
    this.model = normalizeModel(params.model ?? this.model);
    this.ai = new GoogleGenAI({
      apiKey: this.tokenName,
      apiVersion: 'v1alpha',
    });

    try {
      this.session = await this.ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          sessionResumption: {
            handle: this.resumeHandle || undefined,
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            dispatchStatus({ connected: true, message: 'Gemini Live connected' });
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onerror: () => {
            this.cleanupMic();
            this.cleanupPlayback();
            this.session = null;
            dispatchError('Gemini Live socket error');
            dispatchStatus({ connected: false, message: 'Gemini Live disconnected (error)' });
          },
          onclose: () => {
            this.cleanupMic();
            this.cleanupPlayback();
            this.session = null;
            dispatchStatus({ connected: false, message: 'Gemini Live disconnected' });
          },
        },
      });
    } catch (error) {
      this.session = null;
      dispatchError(`Gemini Live connect failed: ${String(error)}`);
      throw error;
    }
  }

  close() {
    if (this.goAwayTimer) {
      clearTimeout(this.goAwayTimer);
      this.goAwayTimer = null;
    }
    this.stopMic();
    this.session?.close();
    this.session = null;
    this.cleanupPlayback();
    dispatchStatus({ connected: false, message: 'Gemini Live closed' });
  }

  sendClientText(text: string) {
    if (!this.session || !text.trim()) return;
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    });
  }

  async startMic() {
    if (!this.session || this.micActive) return;
    this.captureStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.captureContext = new AudioContext({ sampleRate: 16000 });
    const source = this.captureContext.createMediaStreamSource(this.captureStream);
    this.captureProcessor = this.captureContext.createScriptProcessor(4096, 1, 1);
    this.captureSinkGain = this.captureContext.createGain();
    this.captureSinkGain.gain.value = 0;

    source.connect(this.captureProcessor);
    this.captureProcessor.connect(this.captureSinkGain);
    this.captureSinkGain.connect(this.captureContext.destination);

    this.micActive = true;
    dispatchMicState(true);

    this.captureProcessor.onaudioprocess = (event) => {
      if (!this.session) return;
      const float32 = event.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
      }
      this.session.sendRealtimeInput({
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: this.toBase64(int16.buffer),
        },
      });
    };
  }

  stopMic() {
    if (!this.session && !this.micActive) return;
    try {
      this.session?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      // noop
    }
    this.cleanupMic();
  }

  private cleanupMic() {
    this.captureProcessor?.disconnect();
    this.captureProcessor = null;
    this.captureSinkGain?.disconnect();
    this.captureSinkGain = null;
    if (this.captureContext) {
      void this.captureContext.close();
      this.captureContext = null;
    }
    if (this.captureStream) {
      this.captureStream.getTracks().forEach(t => t.stop());
      this.captureStream = null;
    }
    this.micActive = false;
    dispatchMicState(false);
  }

  private cleanupPlayback() {
    this.playbackCursor = 0;
    if (this.playbackContext) {
      void this.playbackContext.close();
      this.playbackContext = null;
    }
  }

  private handleMessage(message: LiveServerMessage) {
    const resumption = message.sessionResumptionUpdate;
    if (resumption?.newHandle) {
      this.resumeHandle = resumption.newHandle;
      dispatchResumption({
        handle: resumption.newHandle,
        resumable: !!resumption.resumable,
        lastConsumedClientMessageIndex: String(resumption.lastConsumedClientMessageIndex ?? ''),
      });
    }

    if (message.goAway?.timeLeft) {
      dispatchStatus({
        connected: true,
        message: `Gemini Live goAway: reconnect recommended (${message.goAway.timeLeft})`,
      });
      this.scheduleReconnect(message.goAway.timeLeft);
    }

    const toolCalls = message.toolCall?.functionCalls ?? [];
    if (toolCalls.length > 0 && this.session) {
      this.session.sendToolResponse({
        functionResponses: toolCalls.map(call => ({
          id: call.id,
          name: call.name,
          response: { error: 'Tool execution is not configured in browser live service.' },
        })),
      });
    }

    this.enqueueAudioFromMessage(message);

    const transcription = message.serverContent?.outputTranscription?.text;
    if (typeof transcription === 'string' && transcription.trim()) {
      dispatchTranscript(transcription.trim());
      return;
    }

    if (typeof message.text === 'string' && message.text.trim()) {
      dispatchTranscript(message.text.trim());
    }
  }

  private enqueueAudioFromMessage(message: LiveServerMessage) {
    const parts = message.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData;
      if (!inlineData?.data) continue;
      const mimeType = String(inlineData.mimeType ?? 'audio/pcm;rate=24000');
      this.enqueueInlineAudio(inlineData.data, mimeType);
    }
  }

  private enqueueInlineAudio(base64: string, mimeType: string) {
    const bytes = this.base64ToBytes(base64);
    if (!bytes || bytes.length === 0) return;

    const normalizedMime = mimeType.toLowerCase();
    if (normalizedMime.includes('audio/pcm') || normalizedMime.includes('audio/l16')) {
      const sampleRate = this.parseSampleRateFromMime(mimeType, 24000);
      this.enqueuePcm16(bytes, sampleRate);
      return;
    }
    this.enqueueEncodedAudio(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }

  private enqueuePcm16(bytes: Uint8Array, sampleRate: number) {
    const sampleCount = Math.floor(bytes.length / 2);
    if (sampleCount <= 0) return;

    const audioBuffer = this.ensurePlaybackContext().createBuffer(1, sampleCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      const lo = bytes[i * 2] ?? 0;
      const hi = bytes[i * 2 + 1] ?? 0;
      const value = (hi << 8) | lo;
      const signed = value >= 0x8000 ? value - 0x10000 : value;
      channel[i] = signed / 32768;
    }
    this.scheduleAudioBuffer(audioBuffer);
  }

  private enqueueEncodedAudio(arrayBuffer: ArrayBuffer) {
    const ctx = this.ensurePlaybackContext();
    void ctx.decodeAudioData(arrayBuffer.slice(0)).then((audioBuffer) => {
      this.scheduleAudioBuffer(audioBuffer);
    }).catch(() => {
      // ignore unsupported chunk formats
    });
  }

  private scheduleAudioBuffer(audioBuffer: AudioBuffer) {
    const ctx = this.ensurePlaybackContext();
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    const startTime = Math.max(ctx.currentTime + 0.02, this.playbackCursor);
    source.start(startTime);
    this.playbackCursor = startTime + audioBuffer.duration;
  }

  private ensurePlaybackContext(): AudioContext {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext();
      this.playbackCursor = this.playbackContext.currentTime;
    }
    return this.playbackContext;
  }

  private toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private parseSampleRateFromMime(mimeType: string, fallback: number): number {
    const raw = (mimeType || '').toLowerCase();
    const rateMatch = raw.match(/(?:rate|samplerate)\s*=\s*(\d{3,6})/);
    if (rateMatch) {
      const parsed = Number(rateMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return fallback;
  }

  private scheduleReconnect(timeLeft: string) {
    if (this.goAwayTimer || this.reconnecting) return;
    if (!this.tokenName) return;

    const delayMs = this.parseDurationMs(timeLeft);
    this.goAwayTimer = setTimeout(async () => {
      this.goAwayTimer = null;
      if (this.reconnecting) return;
      this.reconnecting = true;
      try {
        this.session?.close();
        this.session = null;
        await this.connect({ tokenName: this.tokenName, model: this.model });
        dispatchStatus({ connected: true, message: 'Gemini Live reconnected with session resumption' });
      } catch (error) {
        dispatchError(`Gemini Live reconnect failed: ${String(error)}`);
      } finally {
        this.reconnecting = false;
      }
    }, Math.max(500, delayMs - 300));
  }

  private parseDurationMs(value: string): number {
    const raw = (value || '').trim().toLowerCase();
    if (!raw) return 1500;
    if (raw.endsWith('ms')) {
      const parsed = Number(raw.slice(0, -2));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1500;
    }
    if (raw.endsWith('s')) {
      const parsed = Number(raw.slice(0, -1));
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : 1500;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1500;
  }
}

export const geminiLiveService = new GeminiLiveService();
