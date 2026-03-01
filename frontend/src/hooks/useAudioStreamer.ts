import { useRef, useState, useCallback } from 'react';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from '../utils/identity';
import { createPcmCaptureWorklet } from '../utils/pcmCaptureWorklet';

const SAMPLE_RATE = 16000;
const defaultBackendHost = (() => {
  const rawHost = window.location.hostname || '127.0.0.1';
  return rawHost === 'localhost' || rawHost === '::1' ? '127.0.0.1' : rawHost;
})();
const defaultBackendProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const BASE_ENDPOINT = import.meta.env.VITE_AUDIO_WS_URL ?? `${defaultBackendProtocol}://${defaultBackendHost}:8000/ws/audio`;

const buildAudioEndpoint = () => {
  try {
    const url = new URL(BASE_ENDPOINT, window.location.href);
    url.searchParams.set('user_id', PLAYER_ID);
    url.searchParams.set('room_id', ROOM_ID);
    url.searchParams.set('lang', PLAYER_LANG);
    url.searchParams.set('sync_rate', String(SYNC_RATE));
    return url.toString();
  } catch {
    const separator = BASE_ENDPOINT.includes('?') ? '&' : '?';
    return `${BASE_ENDPOINT}${separator}user_id=${encodeURIComponent(PLAYER_ID)}&room_id=${encodeURIComponent(ROOM_ID)}&lang=${encodeURIComponent(PLAYER_LANG)}&sync_rate=${encodeURIComponent(String(SYNC_RATE))}`;
  }
};

/**
 * Real Native Audio streaming hook.
 *
 * Architecture (Doc §5):
 * 1. Tap microphone via getUserMedia / AudioContext at 16 kHz PCM.
 * 2. Send raw Int16 frames over a dedicated WebSocket to the Python ADK backend.
 *    - The ADK LiveRequestQueue receives these frames and feeds them directly to
 *      Gemini Multimodal Live API (no STT detour).
 * 3. Listen for the JSON Function Calling result (Accuracy / Speed / Passion scores).
 * 4. Dispatch a 'attack_result' CustomEvent so the UI can branch (Critical / Miss).
 *
 * The caller is responsible for the 3-second charge animation – it starts
 * immediately when startStream() is called and runs in parallel with this hook.
 */
export const useAudioStreamer = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);
  const processorCleanupRef = useRef<(() => void) | null>(null);
  const captureSinkGainRef = useRef<GainNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ownsStreamRef = useRef<boolean>(false);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopStream = useCallback(() => {
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.pause();
      captureVideoRef.current.srcObject = null;
      captureVideoRef.current = null;
    }
    captureCanvasRef.current = null;

    processorCleanupRef.current?.();
    processorCleanupRef.current = null;
    if (processorRef.current && 'onaudioprocess' in processorRef.current) {
      (processorRef.current as ScriptProcessorNode).onaudioprocess = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    captureSinkGainRef.current?.disconnect();
    captureSinkGainRef.current = null;
    contextRef.current?.close();
    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach(t => t.stop());
    }
    wsRef.current?.close();
    wsRef.current = null;
    contextRef.current = null;
    streamRef.current = null;
    ownsStreamRef.current = false;
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(async (opts?: { preferredStream?: MediaStream | null }) => {
    if (isStreaming) return;
    setIsStreaming(true);

    try {
      const preferred = opts?.preferredStream ?? null;
      const preferredTrack = preferred?.getAudioTracks?.()[0] ?? null;

      // 1. Acquire mic (prefer existing WebRTC local stream if available)
      let mediaStream: MediaStream;
      if (preferredTrack) {
        mediaStream = new MediaStream([preferredTrack]);
        ownsStreamRef.current = false;
      } else {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        ownsStreamRef.current = true;
      }
      streamRef.current = mediaStream;

      // 2. Set up AudioContext at 16 kHz (Gemini native rate)
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);

      // 3. Open dedicated WebSocket for raw audio (separate from the game event WS)
      const ws = new WebSocket(buildAudioEndpoint());
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Tell backend: open audio gate (matches ADK open_audio_gate())
        ws.send(JSON.stringify({
          cmd: 'open_audio_gate',
          source: preferredTrack ? 'webrtc_local_stream' : 'direct_mic',
          has_video_track: !!preferred?.getVideoTracks?.().length,
          user_id: PLAYER_ID,
          room_id: ROOM_ID,
          lang: PLAYER_LANG,
          sync_rate: SYNC_RATE,
        }));
      };

      // 3.5 If video exists on preferred stream, forward low-fps jpeg snapshots.
      const preferredVideoTrack = preferred?.getVideoTracks?.()[0] ?? null;
      if (preferredVideoTrack) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = new MediaStream([preferredVideoTrack]);
        captureVideoRef.current = video;

        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 144;
        captureCanvasRef.current = canvas;
        const ctx2d = canvas.getContext('2d', { alpha: false });

        video.play().catch(() => {});

        if (ctx2d) {
          videoTimerRef.current = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN || video.readyState < 2) return;
            try {
              ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
              ws.send(JSON.stringify({
                cmd: 'video_frame',
                mime: 'image/jpeg',
                width: canvas.width,
                height: canvas.height,
                frame: dataUrl,
                ts: Date.now(),
              }));
            } catch {}
          }, 700);
        }
      }

      const sendChunk = (float32: Float32Array) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
        }
        wsRef.current.send(int16.buffer);
      };

      // 4. Capture PCM stream: prefer AudioWorkletNode, fallback to ScriptProcessorNode.
      let captureReady = false;
      if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
        try {
          const worklet = await createPcmCaptureWorklet(ctx, source, sendChunk);
          processorRef.current = worklet.node;
          captureSinkGainRef.current = worklet.sinkGain;
          processorCleanupRef.current = worklet.disconnect;
          captureReady = true;
        } catch (workletError) {
          console.warn('[AudioStreamer] AudioWorklet unavailable, fallback to ScriptProcessorNode:', workletError);
        }
      }

      if (!captureReady) {
        // bufferSize=4096 ≈ 256 ms @ 16 kHz – low enough latency
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const sinkGain = ctx.createGain();
        sinkGain.gain.value = 0;
        processorRef.current = processor;
        captureSinkGainRef.current = sinkGain;
        source.connect(processor);
        processor.connect(sinkGain);
        sinkGain.connect(ctx.destination);
        processor.onaudioprocess = (e) => {
          const float32 = e.inputBuffer.getChannelData(0);
          sendChunk(float32);
        };
      }

      // 5. Handle scoring result from ADK / Gemini
      ws.onmessage = (evt) => {
        try {
          const result = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
          if (!result) return;
          // ADK returns Function Calling payload: { accuracy, speed, passion, verdict }
          window.dispatchEvent(
            new CustomEvent('attack_result', { detail: result })
          );
        } catch {}
        stopStream();
      };

      ws.onerror = (e) => {
        console.error('[AudioWS] error', e);
        stopStream();
      };

      ws.onclose = () => {
        if (isStreaming) stopStream();
      };

    } catch (err) {
      console.error('[AudioStreamer] Failed to start:', err);
      stopStream();
    }
  }, [isStreaming, stopStream]);

  return { isStreaming, startStream, stopStream };
};
