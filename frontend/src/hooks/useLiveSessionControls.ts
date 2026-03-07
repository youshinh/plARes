import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geminiLiveService } from '../services/GeminiLiveService';
import { wsService } from '../services/WebSocketService';
import { showSubtitle } from '../utils/uiEvents';
import type { LiveDebugInfo } from '../types/app';
import { useLiveRouteSelector } from './useLiveRouteSelector';

type UseLiveSessionControlsArgs = {
  liveNeedConnectionText: string;
};

const DEFAULT_LIVE_DEBUG_INFO: Omit<
  LiveDebugInfo,
  'conversationRoute' | 'battleCoachingRoute' | 'commentaryRoute' | 'visionTriggerRoute'
> = {
  tokenName: '',
  resumeHandle: '',
  interactionId: '',
  interactionText: '',
  lastStatus: '',
  degradedReason: '',
  adkStatus: 'pending',
};

export const useLiveSessionControls = ({
  liveNeedConnectionText,
}: UseLiveSessionControlsArgs) => {
  const liveRouteSelector = useLiveRouteSelector('current');
  const routeInfo = useMemo(() => ({
    conversationRoute: liveRouteSelector.resolve('conversation').fallback
      ? `${liveRouteSelector.resolve('conversation').primary} -> ${liveRouteSelector.resolve('conversation').fallback}`
      : liveRouteSelector.resolve('conversation').primary,
    battleCoachingRoute: liveRouteSelector.resolve('battle_coaching').fallback
      ? `${liveRouteSelector.resolve('battle_coaching').primary} -> ${liveRouteSelector.resolve('battle_coaching').fallback}`
      : liveRouteSelector.resolve('battle_coaching').primary,
    commentaryRoute: liveRouteSelector.resolve('commentary').fallback
      ? `${liveRouteSelector.resolve('commentary').primary} -> ${liveRouteSelector.resolve('commentary').fallback}`
      : liveRouteSelector.resolve('commentary').primary,
    visionTriggerRoute: liveRouteSelector.resolve('vision_trigger').fallback
      ? `${liveRouteSelector.resolve('vision_trigger').primary} -> ${liveRouteSelector.resolve('vision_trigger').fallback}`
      : liveRouteSelector.resolve('vision_trigger').primary,
  }), [liveRouteSelector]);
  const [liveDebugInfo, setLiveDebugInfo] = useState<LiveDebugInfo>({
    ...DEFAULT_LIVE_DEBUG_INFO,
    ...routeInfo,
  });
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const pendingLiveConnectRef = useRef(false);

  const requestAdkStatus = useCallback(() => {
    wsService.requestAdkStatus({ request_id: `req_${Date.now()}` });
  }, []);

  useEffect(() => {
    setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo }));
  }, [routeInfo]);

  const requestLiveEphemeralToken = useCallback(() => {
    const route = liveRouteSelector.resolve('conversation');
    if (route.primary !== 'browser_direct') {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: route.note, lastStatus: 'route_blocked' }));
      showSubtitle(route.note);
      return;
    }
    setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, lastStatus: 'requesting_live_token', degradedReason: '' }));
    wsService.requestEphemeralToken({
      request_id: `req_${Date.now()}`,
      model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
      response_modalities: ['AUDIO', 'TEXT'],
      session_resumption: true,
      store: false,
    });
  }, [liveRouteSelector, routeInfo]);

  const requestInteractionTurn = useCallback(() => {
    const route = liveRouteSelector.resolve('battle_coaching');
    if (route.primary !== 'backend_interaction') {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: route.note, lastStatus: 'route_blocked' }));
      showSubtitle(route.note);
      return;
    }
    setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, lastStatus: 'requesting_interaction', degradedReason: '' }));
    wsService.requestInteractionTurn({
      request_id: `req_${Date.now()}`,
      input: '現在の戦況で次の一手を一文で提案してください。',
      model: 'models/gemini-3-flash-preview',
      previous_interaction_id: liveDebugInfo.interactionId || undefined,
      store: false,
      system_instruction: 'You are a concise tactical assistant for plARes. Reply in Japanese.',
      max_output_tokens: 120,
    });
  }, [liveDebugInfo.interactionId, liveRouteSelector, routeInfo]);

  const connectLiveDirect = useCallback(async () => {
    const route = liveRouteSelector.resolve('conversation');
    if (route.primary !== 'browser_direct') {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: route.note, lastStatus: 'route_blocked' }));
      showSubtitle(route.note);
      return;
    }
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
  }, [isLiveConnected, liveDebugInfo.tokenName, liveRouteSelector, requestLiveEphemeralToken, routeInfo]);

  const disconnectLiveDirect = useCallback(() => {
    pendingLiveConnectRef.current = false;
    setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, lastStatus: 'closed_by_user' }));
    geminiLiveService.close();
  }, [routeInfo]);

  const toggleLiveMic = useCallback(async () => {
    if (!isLiveConnected) {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: liveNeedConnectionText, lastStatus: 'mic_blocked' }));
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
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: `Live mic error: ${String(error)}`, lastStatus: 'mic_error' }));
      showSubtitle(`Live mic error: ${String(error)}`);
    }
  }, [isLiveConnected, isLiveMicActive, liveNeedConnectionText, routeInfo]);

  const sendLiveTextPing = useCallback(() => {
    const route = liveRouteSelector.resolve('commentary');
    if (route.primary !== 'browser_direct') {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: route.note, lastStatus: 'route_blocked' }));
      showSubtitle(route.note);
      return;
    }
    if (!isLiveConnected) {
      setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, degradedReason: liveNeedConnectionText, lastStatus: 'commentary_blocked' }));
      showSubtitle(liveNeedConnectionText);
      return;
    }
    setLiveDebugInfo((prev) => ({ ...prev, ...routeInfo, lastStatus: 'sending_commentary_ping', degradedReason: '' }));
    geminiLiveService.sendClientText('現在の戦況を短く実況してください。');
  }, [isLiveConnected, liveNeedConnectionText, liveRouteSelector, routeInfo]);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected: boolean; message: string }>).detail;
      if (!detail) return;

      setIsLiveConnected(Boolean(detail.connected));
      setLiveDebugInfo((prev) => ({
        ...prev,
        ...routeInfo,
        lastStatus: detail.message || prev.lastStatus,
        degradedReason: detail.connected ? '' : (detail.message || prev.degradedReason),
      }));
      if (typeof detail.message === 'string' && detail.message) {
        showSubtitle(detail.message);
      }
    };

    const onTranscript = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;

      setLiveDebugInfo((prev) => ({
        ...prev,
        ...routeInfo,
        interactionText: detail.text,
        lastStatus: 'transcript_received',
      }));
      showSubtitle(detail.text);
    };

    const onResumption = (event: Event) => {
      const detail = (event as CustomEvent<{ handle: string }>).detail;
      if (!detail?.handle) return;

      setLiveDebugInfo((prev) => ({
        ...prev,
        ...routeInfo,
        resumeHandle: detail.handle,
        lastStatus: 'session_resumption_ready',
      }));
    };

    const onMicState = (event: Event) => {
      const detail = (event as CustomEvent<{ active: boolean }>).detail;
      setIsLiveMicActive(Boolean(detail?.active));
      setLiveDebugInfo((prev) => ({
        ...prev,
        ...routeInfo,
        lastStatus: detail?.active ? 'mic_active' : 'mic_inactive',
      }));
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        setLiveDebugInfo((prev) => ({
          ...prev,
          ...routeInfo,
          degradedReason: detail.message,
          lastStatus: 'live_error',
        }));
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
  }, [routeInfo]);

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

  useEffect(() => {
    requestAdkStatus();
  }, [requestAdkStatus]);

  useEffect(() => {
    const onSocketStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected: boolean; status: string; message: string }>).detail;
      if (!detail) return;
      setLiveDebugInfo((prev) => ({
        ...prev,
        ...routeInfo,
        lastStatus: `game_ws_${detail.status}`,
        degradedReason: detail.connected ? '' : detail.message,
      }));
      if (detail.connected) {
        requestAdkStatus();
      }
    };

    window.addEventListener('plares_ws_status', onSocketStatus as EventListener);
    return () => {
      window.removeEventListener('plares_ws_status', onSocketStatus as EventListener);
    };
  }, [requestAdkStatus, routeInfo]);

  return {
    connectLiveDirect,
    disconnectLiveDirect,
    isLiveConnected,
    isLiveMicActive,
    liveDebugInfo,
    pendingLiveConnectRef,
    requestInteractionTurn,
    requestAdkStatus,
    requestLiveEphemeralToken,
    sendLiveTextPing,
    setLiveDebugInfo,
    toggleLiveMic,
  };
};
