import { useCallback, useEffect, useRef, useState } from 'react';
import { geminiLiveService } from '../services/GeminiLiveService';
import { wsService } from '../services/WebSocketService';
import { showSubtitle } from '../utils/uiEvents';
import type { LiveDebugInfo } from '../types/app';

type UseLiveSessionControlsArgs = {
  liveNeedConnectionText: string;
};

const DEFAULT_LIVE_DEBUG_INFO: LiveDebugInfo = {
  tokenName: '',
  resumeHandle: '',
  interactionId: '',
  interactionText: '',
};

export const useLiveSessionControls = ({
  liveNeedConnectionText,
}: UseLiveSessionControlsArgs) => {
  const [liveDebugInfo, setLiveDebugInfo] = useState<LiveDebugInfo>(DEFAULT_LIVE_DEBUG_INFO);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const pendingLiveConnectRef = useRef(false);

  const requestLiveEphemeralToken = useCallback(() => {
    wsService.requestEphemeralToken({
      request_id: `req_${Date.now()}`,
      model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      response_modalities: ['AUDIO', 'TEXT'],
      session_resumption: true,
      store: false,
    });
  }, []);

  const requestInteractionTurn = useCallback(() => {
    wsService.requestInteractionTurn({
      request_id: `req_${Date.now()}`,
      input: '現在の戦況で次の一手を一文で提案してください。',
      model: 'models/gemini-3-flash-preview',
      previous_interaction_id: liveDebugInfo.interactionId || undefined,
      store: false,
      system_instruction: 'You are a concise tactical assistant for plARes. Reply in Japanese.',
      max_output_tokens: 120,
    });
  }, [liveDebugInfo.interactionId]);

  const connectLiveDirect = useCallback(async () => {
    if (isLiveConnected) return;
    if (liveDebugInfo.tokenName) {
      try {
        await geminiLiveService.connect({
          tokenName: liveDebugInfo.tokenName,
          model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        });
      } catch {
        // handled by service events
      }
      return;
    }
    pendingLiveConnectRef.current = true;
    requestLiveEphemeralToken();
  }, [isLiveConnected, liveDebugInfo.tokenName, requestLiveEphemeralToken]);

  const disconnectLiveDirect = useCallback(() => {
    pendingLiveConnectRef.current = false;
    geminiLiveService.close();
  }, []);

  const toggleLiveMic = useCallback(async () => {
    if (!isLiveConnected) {
      showSubtitle(liveNeedConnectionText);
      return;
    }
    if (isLiveMicActive) {
      geminiLiveService.stopMic();
      return;
    }
    try {
      await geminiLiveService.startMic();
    } catch (error) {
      showSubtitle(`Live mic error: ${String(error)}`);
    }
  }, [isLiveConnected, isLiveMicActive, liveNeedConnectionText]);

  const sendLiveTextPing = useCallback(() => {
    if (!isLiveConnected) {
      showSubtitle(liveNeedConnectionText);
      return;
    }
    geminiLiveService.sendClientText('現在の戦況を短く実況してください。');
  }, [isLiveConnected, liveNeedConnectionText]);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected: boolean; message: string }>).detail;
      if (!detail) return;

      setIsLiveConnected(Boolean(detail.connected));
      if (typeof detail.message === 'string' && detail.message) {
        showSubtitle(detail.message);
      }
    };

    const onTranscript = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;

      setLiveDebugInfo((prev) => ({
        tokenName: prev.tokenName,
        resumeHandle: prev.resumeHandle,
        interactionId: prev.interactionId,
        interactionText: detail.text,
      }));
      showSubtitle(detail.text);
    };

    const onResumption = (event: Event) => {
      const detail = (event as CustomEvent<{ handle: string }>).detail;
      if (!detail?.handle) return;

      setLiveDebugInfo((prev) => ({
        tokenName: prev.tokenName,
        resumeHandle: detail.handle,
        interactionId: prev.interactionId,
        interactionText: prev.interactionText,
      }));
    };

    const onMicState = (event: Event) => {
      const detail = (event as CustomEvent<{ active: boolean }>).detail;
      setIsLiveMicActive(Boolean(detail?.active));
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        showSubtitle(detail.message);
      }
    };

    window.addEventListener('gemini_live_status', onStatus as EventListener);
    window.addEventListener('gemini_live_transcript', onTranscript as EventListener);
    window.addEventListener('gemini_live_resumption', onResumption as EventListener);
    window.addEventListener('gemini_live_mic_state', onMicState as EventListener);
    window.addEventListener('gemini_live_error', onError as EventListener);

    return () => {
      window.removeEventListener('gemini_live_status', onStatus as EventListener);
      window.removeEventListener('gemini_live_transcript', onTranscript as EventListener);
      window.removeEventListener('gemini_live_resumption', onResumption as EventListener);
      window.removeEventListener('gemini_live_mic_state', onMicState as EventListener);
      window.removeEventListener('gemini_live_error', onError as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isLiveConnected && !geminiLiveService.isConnected()) {
      setIsLiveMicActive(false);
    }
  }, [isLiveConnected]);

  useEffect(() => {
    return () => {
      pendingLiveConnectRef.current = false;
      if (geminiLiveService.isConnected()) {
        geminiLiveService.close();
      }
    };
  }, []);

  return {
    connectLiveDirect,
    disconnectLiveDirect,
    isLiveConnected,
    isLiveMicActive,
    liveDebugInfo,
    pendingLiveConnectRef,
    requestInteractionTurn,
    requestLiveEphemeralToken,
    sendLiveTextPing,
    setLiveDebugInfo,
    toggleLiveMic,
  };
};
