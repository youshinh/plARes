import { useRef, useState, useCallback } from 'react';

const SAMPLE_RATE = 16000;
const ENDPOINT = import.meta.env.VITE_AUDIO_WS_URL ?? 'ws://localhost:8000/ws/audio';

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
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    processorRef.current?.disconnect();
    contextRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());
    wsRef.current?.close();
    wsRef.current = null;
    contextRef.current = null;
    processorRef.current = null;
    streamRef.current = null;
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(async () => {
    if (isStreaming) return;
    setIsStreaming(true);

    try {
      // 1. Acquire mic
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = mediaStream;

      // 2. Set up AudioContext at 16 kHz (Gemini native rate)
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      contextRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);

      // ScriptProcessorNode gives us raw PCM Float32 frames
      // bufferSize=4096 ≈ 256 ms @ 16 kHz – low enough latency
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(ctx.destination);

      // 3. Open dedicated WebSocket for raw audio (separate from the game event WS)
      const ws = new WebSocket(ENDPOINT);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        // Tell backend: open audio gate (matches ADK open_audio_gate())
        ws.send(JSON.stringify({ cmd: 'open_audio_gate' }));
      };

      // 4. Send Int16 PCM frames as binary
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // Convert Float32 → Int16
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
        }
        ws.send(int16.buffer);
      };

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
