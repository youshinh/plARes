import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Environment, OrbitControls } from '@react-three/drei';
import { RobotCharacter } from './components/RobotCharacter';
import { RemoteRobotCharacter } from './components/RemoteRobotCharacter';
import { FaceScanner } from './components/FaceScanner';
import { ServerDrivenPanel } from './components/ui/ServerDrivenPanel';
import { DynamicSubtitle } from './components/ui/DynamicSubtitle';
import { RemoteStreamView } from './components/ui/RemoteStreamView';
import { useVoiceController } from './hooks/useVoiceController';
import { useWebXRScanner } from './hooks/useWebXRScanner';
import { useAICommandListener } from './hooks/useAICommandListener';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { useCharacterSetup } from './hooks/useCharacterSetup';
import { wsService } from './services/WebSocketService';
import { rtcService } from './services/WebRTCDataChannelService';
import { geminiLiveService } from './services/GeminiLiveService';
import { State, useFSMStore } from './store/useFSMStore';
import { GAMEPLAY_RULES } from './constants/gameplay';
import { EX_GAUGE } from '../../shared/constants/battleConstants';
import { localizeBattleEvent, localizeCastStart, localizeResult, localizeTimeout } from './utils/localizeEvent';
import { navMesh } from './utils/NavMeshGenerator';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from './utils/identity';
import * as THREE from 'three';
import type { WebRTCDataChannelPayload, GameEvent } from '../../shared/types/events';

const defaultBackendHost = (() => {
  const rawHost = window.location.hostname || '127.0.0.1';
  return rawHost === 'localhost' || rawHost === '::1' ? '127.0.0.1' : rawHost;
})();
const defaultBackendProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = import.meta.env.VITE_WS_URL ?? `${defaultBackendProtocol}://${defaultBackendHost}:8000/ws/game`;

const store = createXRStore();

// ── Inner scene (must render inside Canvas + XR) ─────────────────────────────
const MainScene: React.FC = () => {
  const { hoverMatrix } = useWebXRScanner();
  useVoiceController();
  useAICommandListener();

  // Listen for NavMesh ready event (fired by useWebXRScanner once point-cloud is dense)
  useEffect(() => {
    const handler = async (e: Event) => {
      const points = (e as CustomEvent<THREE.Vector3[]>).detail;
      await navMesh.buildFromPoints(points);
    };
    window.addEventListener('navmesh_ready', handler);
    return () => window.removeEventListener('navmesh_ready', handler);
  }, []);

  // Placement indicator at the current hit-test surface point
  const indicatorPos = hoverMatrix
    ? new THREE.Vector3().setFromMatrixPosition(hoverMatrix)
    : null;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <Environment preset="city" />
      <RobotCharacter />

      {/* Hit-test placement ring */}
      {indicatorPos && (
        <mesh position={indicatorPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#00ffff" side={2} />
        </mesh>
      )}

      {/* Ground for non-AR debug view */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#e0e0e0" />
      </mesh>
    </>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const { isSetupDone, isGenerating, generateCharacter } = useCharacterSetup();
  const { isStreaming, startStream, stopStream } = useAudioStreamer();
  const setCastingSpecial = useFSMStore(s => s.setCastingSpecial);
  const resolveSpecialResult = useFSMStore(s => s.resolveSpecialResult);
  const [isP2PMediaOn, setIsP2PMediaOn] = useState(false);
  const [specialPhrase, setSpecialPhrase] = useState('');
  const [profileInfo, setProfileInfo] = useState<{
    totalMatches: number;
    totalTrainingSessions: number;
    totalWalkSessions: number;
    tone: string;
    syncRate: number;
    storageBackend: string;
    memorySummary: string;
    recentLogs: Array<{
      timestamp: string;
      roomId: string;
      result: string;
      criticalHits: number;
      misses: number;
      }>;
  } | null>(null);
  const [liveDebugInfo, setLiveDebugInfo] = useState<{
    tokenName: string;
    resumeHandle: string;
    interactionId: string;
    interactionText: string;
  }>({
    tokenName: '',
    resumeHandle: '',
    interactionId: '',
    interactionText: '',
  });
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const [isMatchPaused, setIsMatchPaused] = useState(false);
  const [battleState, setBattleState] = useState({
    hp: 0,
    maxHp: 0,
    opponentHp: 0,
    opponentMaxHp: 0,
    exGauge: 0,
    specialReady: false,
    heatActive: false,
  });
  const pendingLiveConnectRef = useRef(false);
  const castEndsAtRef = useRef<number>(0);
  const specialRetryRef = useRef(0);
  const judgeTimeoutRef = useRef<number | null>(null);
  const handleRemoteBattleEvent = (evt: GameEvent) => {
    const payload = (evt as any)?.payload;
    const target = (evt as any)?.target as string | undefined;
    if (Array.isArray(payload)) return; // server-driven tactical panel payload

    if (payload && typeof payload === 'object') {
      if (payload.kind === 'profile_sync' && payload.profile && (!target || target === PLAYER_ID)) {
        const p = payload.profile as any;
        const logsRaw = Array.isArray(p.recent_match_logs) ? p.recent_match_logs : [];
        const recentLogs = logsRaw.map((log: any) => ({
          timestamp: String(log.timestamp ?? ''),
          roomId: String(log.room_id ?? ''),
          result: String(log.result ?? 'DRAW'),
          criticalHits: Number(log.critical_hits ?? 0),
          misses: Number(log.misses ?? 0),
        }));
        setProfileInfo({
          totalMatches: Number(p.total_matches ?? 0),
          totalTrainingSessions: Number(p.total_training_sessions ?? 0),
          totalWalkSessions: Number(p.total_walk_sessions ?? 0),
          tone: String(p.tone ?? 'balanced'),
          syncRate: Number(p.sync_rate ?? 0.5),
          storageBackend: String(p.storage_backend ?? 'local'),
          memorySummary: String(p.ai_memory_summary ?? ''),
          recentLogs,
        });
        return;
      }
      if (payload.kind === 'milestone_notice' && (!target || target === PLAYER_ID)) {
        const total = Number(payload.total_matches ?? 0);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: `Milestone reached: ${total} matches` }
        }));
        return;
      }
      if (payload.kind === 'battle_status' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => ({
          ...prev,
          hp: Number(payload.hp ?? prev.hp),
          maxHp: Number(payload.max_hp ?? prev.maxHp),
          exGauge: Number(payload.ex_gauge ?? prev.exGauge),
          specialReady: Boolean(payload.special_ready ?? prev.specialReady),
          heatActive: Boolean(payload.heat_active ?? prev.heatActive),
        }));
        return;
      }
      if (payload.kind === 'ex_gauge_update' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => ({
          ...prev,
          exGauge: Number(payload.value ?? prev.exGauge),
          specialReady: Boolean(payload.special_ready ?? prev.specialReady),
          hp: Number(payload.hp ?? prev.hp),
          maxHp: Number(payload.max_hp ?? prev.maxHp),
          heatActive: Boolean(payload.heat_active ?? prev.heatActive),
        }));
        return;
      }
      if (payload.kind === 'special_ready' && (!target || target === PLAYER_ID)) {
        const text = String(payload.text ?? '');
        if (text) setSpecialPhrase(text);
        setBattleState(prev => ({
          ...prev,
          exGauge: Number(payload.ex_gauge ?? EX_GAUGE.MAX),
          specialReady: true,
        }));
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: text || 'Special ready!' }
        }));
        return;
      }
      if (payload.kind === 'special_not_ready' && (!target || target === PLAYER_ID)) {
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'EX gauge is not full') }
        }));
        return;
      }
      if (payload.kind === 'damage_applied') {
        const victim = String(payload.target ?? '');
        const hpAfter = Number(payload.hp_after ?? 0);
        const maxHp = Number(payload.max_hp ?? 0);
        if (victim === PLAYER_ID) {
          setBattleState(prev => ({ ...prev, hp: hpAfter, maxHp }));
        } else {
          setBattleState(prev => ({ ...prev, opponentHp: hpAfter, opponentMaxHp: maxHp }));
        }
        return;
      }
      if (payload.kind === 'heat_state' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => ({
          ...prev,
          heatActive: Boolean(payload.active ?? prev.heatActive),
          hp: Number(payload.hp ?? prev.hp),
          maxHp: Number(payload.max_hp ?? prev.maxHp),
        }));
        return;
      }
      if (payload.kind === 'down_state') {
        const victim = String(payload.target ?? '');
        if (victim === PLAYER_ID) {
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'DOWN! 体勢を立て直せ！' }
          }));
        }
        return;
      }
      if (payload.kind === 'incantation_prompt' && typeof payload.text === 'string') {
        if (target && target !== PLAYER_ID) return;
        setSpecialPhrase(payload.text);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: payload.text }
        }));
        return;
      }
      if (payload.kind === 'persona_tone' && typeof payload.message === 'string') {
        if (target && target !== PLAYER_ID) return;
        setProfileInfo(prev => ({
          totalMatches: prev?.totalMatches ?? 0,
          totalTrainingSessions: prev?.totalTrainingSessions ?? 0,
          totalWalkSessions: prev?.totalWalkSessions ?? 0,
          tone: String(payload.tone ?? prev?.tone ?? 'balanced'),
          syncRate: prev?.syncRate ?? SYNC_RATE,
          storageBackend: prev?.storageBackend ?? 'local',
          memorySummary: prev?.memorySummary ?? '',
          recentLogs: prev?.recentLogs ?? [],
        }));
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: payload.message }
        }));
        return;
      }
      if (payload.kind === 'fused_item') {
        const concept = typeof payload.concept === 'string' ? payload.concept : 'fused item';
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: `Fusion Drop: ${concept}` }
        }));
        return;
      }
      if (payload.kind === 'intervention_rejected') {
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'Intervention rejected') }
        }));
        return;
      }
      if (payload.kind === 'match_pause') {
        setIsMatchPaused(true);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'Match paused (connection issue)') }
        }));
        return;
      }
      if (payload.kind === 'match_resumed') {
        setIsMatchPaused(false);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'Match resumed') }
        }));
        return;
      }
      if (payload.kind === 'state_correction') {
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'State corrected by server') }
        }));
        return;
      }
      if (payload.kind === 'live_ephemeral_token' && (!target || target === PLAYER_ID)) {
        if (payload.ok) {
          setLiveDebugInfo(prev => ({
            tokenName: String(payload.token_name ?? prev.tokenName ?? ''),
            resumeHandle: prev.resumeHandle,
            interactionId: prev.interactionId,
            interactionText: prev.interactionText,
          }));
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: {
              text: `Live token ready (${String(payload.model ?? 'model')})`,
            }
          }));
          if (pendingLiveConnectRef.current) {
            pendingLiveConnectRef.current = false;
            const tokenName = String(payload.token_name ?? '');
            if (tokenName) {
              geminiLiveService.connect({
                tokenName,
                model: String(payload.model ?? 'gemini-live-2.5-flash-preview'),
              }).catch(() => {});
            }
          }
        } else {
          pendingLiveConnectRef.current = false;
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: `Token error: ${String(payload.error ?? 'unknown')}` }
          }));
        }
        return;
      }
      if (payload.kind === 'interaction_response' && (!target || target === PLAYER_ID)) {
        if (payload.ok) {
          const text = String(payload.text ?? '');
          setLiveDebugInfo(prev => ({
            tokenName: prev.tokenName,
            resumeHandle: prev.resumeHandle,
            interactionId: String(payload.interaction_id ?? prev.interactionId ?? ''),
            interactionText: text,
          }));
          if (text) {
            window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text } }));
          }
        } else {
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: `Interaction error: ${String(payload.error ?? 'unknown')}` }
          }));
        }
        return;
      }
    }

    if (evt.event === 'winner_interview' && payload && typeof payload === 'object') {
      const text = (payload as any).text;
      if (typeof text === 'string' && text.trim()) {
        window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text } }));
      }
      return;
    }
    if (evt.event === 'disconnect_tko' && payload && typeof payload === 'object') {
      setIsMatchPaused(true);
      const loser = String((payload as any).loser ?? 'unknown');
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: `Connection TKO: ${loser}` }
      }));
      return;
    }

    if (!evt?.event || evt.user === PLAYER_ID) return;
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: localizeBattleEvent(evt.event, evt.user) }
    }));
  };

  // Connect WebSocket on mount
  useEffect(() => {
    wsService.connect(WS_URL, PLAYER_ID, ROOM_ID, PLAYER_LANG, SYNC_RATE);
    rtcService.start(PLAYER_ID);
    return () => {
      rtcService.stop();
      wsService.disconnect();
    };
  }, []);

  const toggleP2PMedia = async () => {
    try {
      if (!isP2PMediaOn) {
        await rtcService.enableMedia({ audio: true, video: true });
        setIsP2PMediaOn(true);
        return;
      }
      await rtcService.disableMedia();
      setIsP2PMediaOn(false);
    } catch (error) {
      console.error('[P2P AV] toggle failed', error);
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: 'P2P AVの開始に失敗しました' }
      }));
    }
  };

  const requestFusionDrop = () => {
    wsService.sendEvent({
      event: 'item_dropped',
      user: PLAYER_ID,
      payload: {
        craft_request: true,
        concept: specialPhrase || 'legendary spring roll blade',
      },
    });
  };

  const requestProfileSync = () => {
    wsService.sendEvent({
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: { kind: 'request_profile_sync' },
    });
  };

  const requestMatchEnd = () => {
    wsService.sendEvent({
      event: 'match_end' as any,
      user: PLAYER_ID,
      payload: { trigger: 'manual' },
    });
  };

  const requestLiveEphemeralToken = () => {
    wsService.requestEphemeralToken({
        request_id: `req_${Date.now()}`,
        model: 'models/gemini-live-2.5-flash-preview',
        response_modalities: ['AUDIO', 'TEXT'],
        session_resumption: true,
        store: false,
    });
  };

  const requestInteractionTurn = () => {
    wsService.requestInteractionTurn({
        request_id: `req_${Date.now()}`,
        input: '現在の戦況で次の一手を一文で提案してください。',
        model: 'models/gemini-flash-latest',
        previous_interaction_id: liveDebugInfo.interactionId || undefined,
        store: false,
        system_instruction: 'You are a concise tactical assistant for PlaresAR. Reply in Japanese.',
        max_output_tokens: 120,
    });
  };

  const connectLiveDirect = async () => {
    if (isLiveConnected) return;
    if (liveDebugInfo.tokenName) {
      try {
        await geminiLiveService.connect({
          tokenName: liveDebugInfo.tokenName,
          model: 'models/gemini-live-2.5-flash-preview',
        });
      } catch {
        // handled by service events
      }
      return;
    }
    pendingLiveConnectRef.current = true;
    requestLiveEphemeralToken();
  };

  const disconnectLiveDirect = () => {
    pendingLiveConnectRef.current = false;
    geminiLiveService.close();
  };

  const toggleLiveMic = async () => {
    if (!isLiveConnected) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: 'Connect Live first' }
      }));
      return;
    }
    if (isLiveMicActive) {
      geminiLiveService.stopMic();
      return;
    }
    try {
      await geminiLiveService.startMic();
    } catch (error) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: `Live mic error: ${String(error)}` }
      }));
    }
  };

  const sendLiveTextPing = () => {
    if (!isLiveConnected) return;
    geminiLiveService.sendClientText('現在の戦況を短く実況してください。');
  };

  useEffect(() => {
    const unsubscribe = wsService.addHandler((payload: WebRTCDataChannelPayload) => {
      if (payload.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onP2PPayload = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      if (payload?.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    };
    window.addEventListener('webrtc_payload', onP2PPayload as EventListener);
    return () => window.removeEventListener('webrtc_payload', onP2PPayload as EventListener);
  }, []);

  useEffect(() => {
    const onAttackResult = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const verdict = detail.verdict === 'critical' ? 'critical' : 'miss';
      const delay = Math.max(0, castEndsAtRef.current - Date.now());
      if (judgeTimeoutRef.current) {
        clearTimeout(judgeTimeoutRef.current);
        judgeTimeoutRef.current = null;
      }
      specialRetryRef.current = 0;

      window.setTimeout(() => {
        resolveSpecialResult({ verdict });

        const payload = {
          event: verdict === 'critical' ? 'critical_hit' : 'debuff_applied',
          user: PLAYER_ID,
          payload: detail,
        } as const;

        // Server-side broadcasted results should not be echoed again.
        if (!detail.broadcasted) {
          if (!rtcService.send({ type: 'event', data: payload })) {
            wsService.sendEvent(payload);
          }
        }

        const suffix =
          typeof detail.video_frame_count === 'number'
            ? ` (src:${detail.source ?? 'n/a'}, vf:${detail.video_frame_count}, sr:${detail.sync_rate ?? 'n/a'})`
            : '';
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: `${localizeResult(verdict)}${suffix}` }
        }));
      }, delay);
    };

    window.addEventListener('attack_result', onAttackResult);
    return () => window.removeEventListener('attack_result', onAttackResult);
  }, [resolveSpecialResult]);

  useEffect(() => {
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected: boolean; message: string }>).detail;
      if (!detail) return;
      setIsLiveConnected(!!detail.connected);
      if (typeof detail.message === 'string' && detail.message) {
        window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text: detail.message } }));
      }
    };

    const onTranscript = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setLiveDebugInfo(prev => ({
        tokenName: prev.tokenName,
        resumeHandle: prev.resumeHandle,
        interactionId: prev.interactionId,
        interactionText: detail.text,
      }));
      window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text: detail.text } }));
    };

    const onResumption = (event: Event) => {
      const detail = (event as CustomEvent<{ handle: string }>).detail;
      if (!detail?.handle) return;
      setLiveDebugInfo(prev => ({
        tokenName: prev.tokenName,
        resumeHandle: detail.handle,
        interactionId: prev.interactionId,
        interactionText: prev.interactionText,
      }));
    };

    const onMicState = (event: Event) => {
      const detail = (event as CustomEvent<{ active: boolean }>).detail;
      setIsLiveMicActive(!!detail?.active);
    };

    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      if (detail?.message) {
        window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text: detail.message } }));
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
    return () => {
      if (judgeTimeoutRef.current) {
        clearTimeout(judgeTimeoutRef.current);
        judgeTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCastSpecial = async () => {
    if (isMatchPaused) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: '試合が一時停止中です' }
      }));
      return;
    }
    if (!battleState.specialReady) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: `EXゲージ不足 (${battleState.exGauge}/${EX_GAUGE.MAX})` }
      }));
      return;
    }
    // 1) Instantly enter CASTING state and lock the next 3s for latency concealment
    castEndsAtRef.current = Date.now() + GAMEPLAY_RULES.specialChargeMs;
    specialRetryRef.current = 0;
    setBattleState(prev => ({ ...prev, specialReady: false, exGauge: 0 }));
    if (judgeTimeoutRef.current) {
      clearTimeout(judgeTimeoutRef.current);
      judgeTimeoutRef.current = null;
    }
    setCastingSpecial();

    // 2) Visual feedback starts immediately while backend inference runs in parallel
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: localizeCastStart(specialPhrase || undefined) }
    }));

    // 3) Sync casting start so the opponent can render the same charge phase
    const castEvent = {
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: { action: 'casting_special' }
    } as const;
    if (!rtcService.send({ type: 'event', data: castEvent })) {
      wsService.sendEvent(castEvent);
    }

    // 4) Start raw audio stream in parallel with the 3s charge window
    await startStream({ preferredStream: rtcService.getLocalStream() });

    // 5) Failsafe: timeout at charge-end, retry once, then force MISS.
    const scheduleJudgeTimeout = (delayMs: number) => {
      judgeTimeoutRef.current = window.setTimeout(async () => {
        if (useFSMStore.getState().currentState !== State.CASTING_SPECIAL) return;

        if (specialRetryRef.current < GAMEPLAY_RULES.specialJudgeRetryCount) {
          specialRetryRef.current += 1;
          stopStream();
          await startStream({ preferredStream: rtcService.getLocalStream() });
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: '判定再試行...' }
          }));
          scheduleJudgeTimeout(1200);
          return;
        }

        resolveSpecialResult({ verdict: 'miss' });
        const timeoutPayload = {
          event: 'debuff_applied',
          user: PLAYER_ID,
          payload: { reason: 'special_judge_timeout', timeout: true },
        } as const;
        if (!rtcService.send({ type: 'event', data: timeoutPayload })) {
          wsService.sendEvent(timeoutPayload);
        }
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: localizeTimeout() }
        }));
      }, delayMs);
    };

    scheduleJudgeTimeout(GAMEPLAY_RULES.specialChargeMs);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#111' }}>

      {/* ── 初回セットアップ：FaceScanner オーバーレイ ─────────── */}
      {!isSetupDone && (
        <FaceScanner
          onGenerate={generateCharacter}
          isGenerating={isGenerating}
        />
      )}

      {/* AR entry */}
      <button
        id="btn-enter-ar"
        style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, padding: '8px 16px', borderRadius: 6 }}
        onClick={() => store.enterAR()}
      >
        Enter AR
      </button>

      {profileInfo && (
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 16,
            zIndex: 10,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.55)',
            color: 'white',
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          <div>{`Matches: ${profileInfo.totalMatches}`}</div>
          <div>{`Training: ${profileInfo.totalTrainingSessions}`}</div>
          <div>{`Walks: ${profileInfo.totalWalkSessions}`}</div>
          <div>{`Tone: ${profileInfo.tone}`}</div>
          <div>{`Sync: ${profileInfo.syncRate.toFixed(2)}`}</div>
          <div>{`Store: ${profileInfo.storageBackend}`}</div>
          <div>{`HP: ${battleState.hp}/${battleState.maxHp || '-'}`}</div>
          <div>{`Enemy HP: ${battleState.opponentHp}/${battleState.opponentMaxHp || '-'}`}</div>
          <div>{`EX: ${battleState.exGauge}/${EX_GAUGE.MAX} ${battleState.specialReady ? '(READY)' : ''}`}</div>
          <div>{`Heat: ${battleState.heatActive ? 'ON' : 'OFF'}`}</div>
          <div style={{ marginTop: 4, opacity: 0.85, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profileInfo.memorySummary || 'No memory summary yet'}
          </div>
          {profileInfo.recentLogs.length > 0 && (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6 }}>
              {profileInfo.recentLogs.map((log, idx) => (
                <div key={`${log.timestamp}-${idx}`} style={{ opacity: 0.9 }}>
                  {`${log.result} C:${log.criticalHits} M:${log.misses}`}
                </div>
              ))}
            </div>
          )}
          {(liveDebugInfo.tokenName || liveDebugInfo.interactionId || liveDebugInfo.interactionText) && (
            <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 6, opacity: 0.9 }}>
              {liveDebugInfo.tokenName && <div>{`Token: ${liveDebugInfo.tokenName}`}</div>}
              {liveDebugInfo.resumeHandle && <div>{`Resume: ${liveDebugInfo.resumeHandle}`}</div>}
              {liveDebugInfo.interactionId && <div>{`Interaction: ${liveDebugInfo.interactionId}`}</div>}
              {liveDebugInfo.interactionText && (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>
                  {liveDebugInfo.interactionText}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Special move trigger (charge animation + live audio stream) */}
      <button
        id="btn-cast-special"
        disabled={isStreaming || isMatchPaused || !battleState.specialReady}
        style={{
          position: 'absolute', bottom: 24, right: 24, zIndex: 10,
          padding: '18px 24px', fontSize: 18, borderRadius: 10,
          background: (isStreaming || isMatchPaused || !battleState.specialReady) ? '#555' : '#cc2200', color: 'white',
          cursor: (isStreaming || isMatchPaused || !battleState.specialReady) ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
        }}
        onClick={handleCastSpecial}
      >
        {isMatchPaused
          ? '一時停止中'
          : (isStreaming ? '詠唱中…' : (battleState.specialReady ? 'CAST SPECIAL ⚡' : `EX ${battleState.exGauge}/${EX_GAUGE.MAX}`))}
      </button>

      <button
        id="btn-p2p-media"
        style={{
          position: 'absolute', bottom: 24, left: 24, zIndex: 10,
          padding: '12px 16px', borderRadius: 8,
          background: isP2PMediaOn ? '#1d7a2f' : '#244c8a',
          color: 'white', border: 'none', cursor: 'pointer'
        }}
        onClick={toggleP2PMedia}
      >
        {isP2PMediaOn ? 'P2P AV ON' : 'P2P AV OFF'}
      </button>

      <button
        id="btn-fusion-drop"
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 10,
          padding: '10px 12px', borderRadius: 8,
          background: '#8a5c24', color: 'white', border: 'none', cursor: 'pointer'
        }}
        onClick={requestFusionDrop}
      >
        DROP FUSION ITEM
      </button>

      <button
        id="btn-match-end"
        style={{
          position: 'absolute', top: 16, left: 120, zIndex: 10,
          padding: '8px 16px', borderRadius: 6,
          background: '#d32f2f', color: 'white', border: 'none', cursor: 'pointer'
        }}
        onClick={requestMatchEnd}
      >
        END MATCH
      </button>

      <button
        id="btn-profile-sync"
        style={{
          position: 'absolute', top: 64, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: '#2d2d2d', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={requestProfileSync}
      >
        REFRESH MEMORY
      </button>

      <button
        id="btn-live-token"
        style={{
          position: 'absolute', top: 104, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: '#1c4b7d', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={requestLiveEphemeralToken}
      >
        ISSUE LIVE TOKEN
      </button>

      <button
        id="btn-live-connect"
        style={{
          position: 'absolute', top: 184, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: isLiveConnected ? '#2f6f2f' : '#20555a',
          color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={isLiveConnected ? disconnectLiveDirect : connectLiveDirect}
      >
        {isLiveConnected ? 'DISCONNECT LIVE' : 'CONNECT LIVE'}
      </button>

      <button
        id="btn-live-mic"
        style={{
          position: 'absolute', top: 224, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: isLiveMicActive ? '#7a2d2d' : '#3a5f8f',
          color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={toggleLiveMic}
      >
        {isLiveMicActive ? 'STOP LIVE MIC' : 'START LIVE MIC'}
      </button>

      <button
        id="btn-live-text"
        style={{
          position: 'absolute', top: 264, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: '#5b3a7e',
          color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={sendLiveTextPing}
      >
        SEND LIVE TEXT
      </button>

      <button
        id="btn-interaction-turn"
        style={{
          position: 'absolute', top: 304, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: '#3f2d77', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={requestInteractionTurn}
      >
        TEST INTERACTION
      </button>

      <button
        id="btn-test-texture"
        style={{
          position: 'absolute', top: 344, right: 16, zIndex: 10,
          padding: '8px 10px', borderRadius: 8,
          background: '#a52a2a', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer'
        }}
        onClick={() => {
          // A tiny 2x2 placeholder generated pattern demonstrating texture replacement
          const testTex = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2NkYGD4z8DAwMgAI0AMDA4AF2H/h68AAAAASUVORK5CYII='
          useFSMStore.getState().setTexture(testTex);
          setTimeout(() => { useFSMStore.getState().setTexture(null); }, 5000);
        }}
      >
        TEST TEXTURE
      </button>

      <Canvas shadows>
        <XR store={store}>
          <MainScene />
          <RemoteRobotCharacter />
          <OrbitControls makeDefault />
        </XR>
      </Canvas>

      <ServerDrivenPanel />
      <DynamicSubtitle />
      <RemoteStreamView />
    </div>
  );
}

export default App;
