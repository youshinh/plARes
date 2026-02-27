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
import { CharacterLabPanel } from './components/ui/CharacterLabPanel';
import { ShareArenaModal } from './components/ui/ShareArenaModal';
import { useVoiceController } from './hooks/useVoiceController';
import { useWebXRScanner } from './hooks/useWebXRScanner';
import { useAICommandListener } from './hooks/useAICommandListener';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { useCharacterSetup } from './hooks/useCharacterSetup';
import { wsService } from './services/WebSocketService';
import { rtcService } from './services/WebRTCDataChannelService';
import { geminiLiveService } from './services/GeminiLiveService';
import { State, useFSMStore } from './store/useFSMStore';
import { normalizeArenaCalibration, useArenaSyncStore } from './store/useArenaSyncStore';
import { GAMEPLAY_RULES } from './constants/gameplay';
import { EX_GAUGE } from '../../shared/constants/battleConstants';
import { localizeBattleEvent, localizeCastStart, localizeResult, localizeTimeout } from './utils/localizeEvent';
import { navMesh } from './utils/NavMeshGenerator';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from './utils/identity';
import { evolveCharacterDNAByMatchCount, normalizeCharacterDNA } from './utils/characterDNA';
import type { CharacterDNA } from '../../shared/types/firestore';
import * as THREE from 'three';
import type { WebRTCDataChannelPayload, GameEvent } from '../../shared/types/events';
import './App.css';

const defaultBackendHost = (() => {
  const rawHost = window.location.hostname || '127.0.0.1';
  return rawHost === 'localhost' || rawHost === '::1' ? '127.0.0.1' : rawHost;
})();
const defaultBackendProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const WS_URL = import.meta.env.VITE_WS_URL ?? `${defaultBackendProtocol}://${defaultBackendHost}:8000/ws/game`;
const DEBUG_UI = import.meta.env.VITE_ENABLE_DEBUG_UI === 'true';
const CHARACTER_LAB_UI = import.meta.env.VITE_ENABLE_CHARACTER_LAB !== 'false';
const STORAGE_LANG_KEY = 'plares_lang';
const STORAGE_LANG_SELECTED_KEY = 'plares_lang_selected';

type UiLang = 'ja' | 'en' | 'es';

const toUiLang = (raw: string): UiLang => {
  const value = (raw || '').toLowerCase();
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('es')) return 'es';
  return 'en';
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clampHp = (value: number, maxHp: number): number =>
  Math.max(0, Math.min(value, maxHp));

const UI_TEXT: Record<UiLang, Record<string, string>> = {
  ja: {
    brandSub: '次世代AIエージェントバトル',
    language: '言語',
    chooseLanguage: '表示言語を選択',
    chooseLanguageDesc: '最初に使う言語を選んでください。後で変更できます。',
    enterAr: 'AR開始',
    endMatch: '試合終了',
    pilotTelemetry: 'パイロット情報',
    matches: '試合',
    training: '修行',
    walks: '散歩',
    tone: '口調',
    sync: 'シンクロ',
    store: '保存先',
    hp: 'HP',
    enemyHp: '敵HP',
    heat: 'ヒート',
    noMemory: 'メモリはまだありません',
    dropFusion: 'フュージョン投下',
    refreshMemory: '記憶を更新',
    issueLiveToken: 'Liveトークン発行',
    connectLive: 'LIVE接続',
    disconnectLive: 'LIVE切断',
    startLiveMic: 'LIVEマイク開始',
    stopLiveMic: 'LIVEマイク停止',
    sendLiveText: 'LIVEテキスト送信',
    testInteraction: '会話テスト',
    testTexture: 'テクスチャ確認',
    castSpecial: '必殺発動 ⚡',
    matchPaused: '一時停止中',
    casting: '詠唱中…',
    p2pOn: 'P2P AV ON',
    p2pOff: 'P2P AV OFF',
    alignArena: '位置合わせ',
    alignPending: '位置合わせ待ち',
    alignReady: '位置合わせ完了',
    alignNeedSurface: 'AR平面が未検出です。床を映して再実行してください。',
    alignShared: '位置合わせ基準を共有しました',
    alignPeerSynced: '相手の位置合わせ情報を受信',
    menu: 'メニュー',
    share: '共有 (QR)',
  },
  en: {
    brandSub: 'Next-Gen AI Agent Arena',
    language: 'Language',
    chooseLanguage: 'Choose your language',
    chooseLanguageDesc: 'Pick your default UI language. You can change this later.',
    enterAr: 'Enter AR',
    endMatch: 'End Match',
    pilotTelemetry: 'Pilot Telemetry',
    matches: 'Matches',
    training: 'Training',
    walks: 'Walks',
    tone: 'Tone',
    sync: 'Sync',
    store: 'Store',
    hp: 'HP',
    enemyHp: 'Enemy HP',
    heat: 'Heat',
    noMemory: 'No memory summary yet',
    dropFusion: 'Drop Fusion Item',
    refreshMemory: 'Refresh Memory',
    issueLiveToken: 'Issue Live Token',
    connectLive: 'Connect Live',
    disconnectLive: 'Disconnect Live',
    startLiveMic: 'Start Live Mic',
    stopLiveMic: 'Stop Live Mic',
    sendLiveText: 'Send Live Text',
    testInteraction: 'Test Interaction',
    testTexture: 'Test Texture',
    castSpecial: 'Cast Special ⚡',
    matchPaused: 'Match Paused',
    casting: 'Casting…',
    p2pOn: 'P2P AV ON',
    p2pOff: 'P2P AV OFF',
    alignArena: 'Align Arena',
    alignPending: 'Alignment Pending',
    alignReady: 'Alignment Ready',
    alignNeedSurface: 'No AR surface detected yet. Point the camera at the floor and retry.',
    alignShared: 'Shared arena alignment marker.',
    alignPeerSynced: 'Opponent alignment data received.',
    menu: 'Menu',
    share: 'Share (QR)',
  },
  es: {
    brandSub: 'Arena de Agentes IA',
    language: 'Idioma',
    chooseLanguage: 'Elige tu idioma',
    chooseLanguageDesc: 'Selecciona el idioma inicial de la interfaz. Puedes cambiarlo despues.',
    enterAr: 'Entrar AR',
    endMatch: 'Finalizar',
    pilotTelemetry: 'Telemetria',
    matches: 'Partidas',
    training: 'Entreno',
    walks: 'Paseos',
    tone: 'Tono',
    sync: 'Sincronia',
    store: 'Almacen',
    hp: 'HP',
    enemyHp: 'HP rival',
    heat: 'Heat',
    noMemory: 'Sin resumen de memoria',
    dropFusion: 'Soltar Fusion',
    refreshMemory: 'Actualizar Memoria',
    issueLiveToken: 'Emitir Token Live',
    connectLive: 'Conectar Live',
    disconnectLive: 'Desconectar Live',
    startLiveMic: 'Iniciar Micro Live',
    stopLiveMic: 'Detener Micro Live',
    sendLiveText: 'Enviar Texto Live',
    testInteraction: 'Probar Interaccion',
    testTexture: 'Probar Textura',
    castSpecial: 'Lanzar Especial ⚡',
    matchPaused: 'Partida en pausa',
    casting: 'Canalizando…',
    p2pOn: 'P2P AV ON',
    p2pOff: 'P2P AV OFF',
    alignArena: 'Alinear Arena',
    alignPending: 'Alineacion pendiente',
    alignReady: 'Alineacion lista',
    alignNeedSurface: 'Aun no se detecta una superficie AR. Enfoca el suelo y reintenta.',
    alignShared: 'Marcador de alineacion compartido.',
    alignPeerSynced: 'Datos de alineacion del rival recibidos.',
    menu: 'Menu',
    share: 'Compartir (QR)',
  },
};

const store = createXRStore({
  // Request AR features through @pmndrs/xr session-init options.
  // local-floor is a reference space requested in useWebXRScanner.
  hitTest: true,
  depthSensing: true,
});

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
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#CFE8FF', '#1B2634', 0.8]} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-2.5, 1.8, 2.2]} intensity={0.9} color="#7BC8FF" />
      <pointLight position={[2.2, 1.1, -1.5]} intensity={0.55} color="#FFB26B" />
      <Environment preset="sunset" />
      <RobotCharacter />
      <RemoteRobotCharacter />

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
        <meshStandardMaterial color="#2C313A" roughness={0.86} metalness={0.08} />
      </mesh>
    </>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const uiLang = toUiLang(PLAYER_LANG);
  const t = UI_TEXT[uiLang];
  const { isSetupDone, isGenerating, generateCharacter } = useCharacterSetup();
  const { isStreaming, startStream, stopStream } = useAudioStreamer();
  const setCastingSpecial = useFSMStore(s => s.setCastingSpecial);
  const resolveSpecialResult = useFSMStore(s => s.resolveSpecialResult);
  const setRobotStats = useFSMStore(s => s.setRobotStats);
  const robotDna = useFSMStore(s => s.robotDna);
  const robotMaterial = useFSMStore(s => s.robotMeta.material);
  const setRobotDna = useFSMStore(s => s.setRobotDna);
  const matchAlignmentReady = useArenaSyncStore(s => s.matchAlignmentReady);
  const hasRemotePeer = useArenaSyncStore(s => s.hasRemotePeer);
  const isSolo = !hasRemotePeer;
  const localHp = useFSMStore(s => s.localHp);
  const enemyHp = useFSMStore(s => s.enemyHp);

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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [recentABFeedbackCount, setRecentABFeedbackCount] = useState(0);
  const [bgmUrl, setBgmUrl] = useState('');
  const [showLanguageChooser] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(STORAGE_LANG_SELECTED_KEY);
    } catch {
      return false;
    }
  });
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (uiLang === 'ja') return 'ja-JP';
    if (uiLang === 'es') return 'es-ES';
    return 'en-US';
  });
  const [battleState, setBattleState] = useState({
    hp: 100,
    maxHp: 100,
    opponentHp: 100,
    opponentMaxHp: 100,
    exGauge: 0,
    specialReady: false,
    heatActive: false,
  });
  const pendingLiveConnectRef = useRef(false);
  const castEndsAtRef = useRef<number>(0);
  const specialRetryRef = useRef(0);
  const judgeTimeoutRef = useRef<number | null>(null);
  const alignmentReady = matchAlignmentReady;
  const profileView = profileInfo ?? {
    totalMatches: 0,
    totalTrainingSessions: 0,
    totalWalkSessions: 0,
    tone: 'balanced',
    syncRate: SYNC_RATE,
    storageBackend: 'local',
    memorySummary: '',
    recentLogs: [] as Array<{
      timestamp: string;
      roomId: string;
      result: string;
      criticalHits: number;
      misses: number;
    }>,
  };

  const applyLanguage = (langCode: string, markAsChosen: boolean) => {
    try {
      localStorage.setItem(STORAGE_LANG_KEY, langCode);
      if (markAsChosen) {
        localStorage.setItem(STORAGE_LANG_SELECTED_KEY, 'done');
      }
    } catch {
      // noop
    }
    window.location.reload();
  };
  const publishArenaCalibration = () => {
    const sample = useArenaSyncStore.getState().latestSample;
    if (!sample) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.alignNeedSurface }
      }));
      return;
    }

    useArenaSyncStore.getState().setLocalCalibration(sample);
    wsService.sendEvent({
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: {
        kind: 'arena_calibration',
        calibration: sample,
      },
    });
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.alignShared }
    }));
  };
  const submitDnaABFeedback = (payload: {
    choice: 'A' | 'B';
    scoreA: number;
    scoreB: number;
    note: string;
    variantA: CharacterDNA;
    variantB: CharacterDNA;
  }) => {
    wsService.sendEvent({
      event: 'dna_ab_feedback',
      user: PLAYER_ID,
      payload: {
        choice: payload.choice,
        scoreA: payload.scoreA,
        scoreB: payload.scoreB,
        note: payload.note,
        variantA: payload.variantA,
        variantB: payload.variantB,
      },
    });
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: `A/B feedback saved: ${payload.choice}` }
    }));
  };
  const handleRemoteBattleEvent = (evt: GameEvent) => {
    const payload = (evt as any)?.payload;
    const target = (evt as any)?.target as string | undefined;
    if (Array.isArray(payload)) return; // server-driven tactical panel payload

    if (payload && typeof payload === 'object') {
      if (payload.kind === 'arena_calibration') {
        const sender = String((evt as any)?.user ?? '');
        if (!sender || sender === PLAYER_ID) return;
        const calibration = normalizeArenaCalibration((payload as any).calibration);
        if (!calibration) return;
        const arenaSync = useArenaSyncStore.getState();
        arenaSync.setRemoteCalibration(sender, calibration);
        const readyWithSender = useArenaSyncStore.getState().hasAlignment(sender);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: readyWithSender ? t.alignReady : t.alignPeerSynced }
        }));
        return;
      }
      if (payload.kind === 'profile_sync' && payload.profile && (!target || target === PLAYER_ID)) {
        const p = payload.profile as any;
        const logsRaw = Array.isArray(p.recent_match_logs) ? p.recent_match_logs : [];
        const totalMatches = Number(p.total_matches ?? 0);
        const recentLogs = logsRaw.map((log: any) => ({
          timestamp: String(log.timestamp ?? ''),
          roomId: String(log.room_id ?? ''),
          result: String(log.result ?? 'DRAW'),
          criticalHits: Number(log.critical_hits ?? 0),
          misses: Number(log.misses ?? 0),
        }));
        const candidateDna =
          normalizeCharacterDNA(p.character_dna) ??
          normalizeCharacterDNA(p.characterDna);
        if (candidateDna) {
          setRobotDna(evolveCharacterDNAByMatchCount(candidateDna, totalMatches));
        }
        const stats = p.robot_stats;
        if (stats && typeof stats === 'object') {
          const rawMaterial = String(p.robot_material ?? robotMaterial);
          const material = rawMaterial === 'Metal' || rawMaterial === 'Resin' ? rawMaterial : 'Wood';
          setRobotStats(
            {
              power: Number((stats as any).power ?? 40),
              speed: Number((stats as any).speed ?? 40),
              vit: Number((stats as any).vit ?? 40),
            },
            {
              name: String(p.player_name ?? 'Plares Unit'),
              material,
              tone: String(p.tone ?? 'balanced'),
            },
          );
        }
        const recentAB = Array.isArray(p.recent_dna_ab_tests) ? p.recent_dna_ab_tests : [];
        setRecentABFeedbackCount(recentAB.length);
        setProfileInfo({
          totalMatches,
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
        setRobotDna(evolveCharacterDNAByMatchCount(robotDna, total));
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: `Milestone reached: ${total} matches` }
        }));
        return;
      }
      if (payload.kind === 'dna_ab_feedback_saved' && (!target || target === PLAYER_ID)) {
        setRecentABFeedbackCount((n) => Math.max(n, Number(payload.total ?? n)));
        return;
      }
      if (payload.kind === 'battle_status' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => {
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const opponentMaxHp = toPositiveNumber(payload.opponent_max_hp, prev.opponentMaxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          const opponentHpAfter = clampHp(toFiniteNumber(payload.opponent_hp, prev.opponentHp), opponentMaxHp);
          useFSMStore.getState().syncHp('local', hpAfter);
          useFSMStore.getState().syncHp('enemy', opponentHpAfter);
          return {
            ...prev,
            hp: hpAfter,
            maxHp,
            opponentHp: opponentHpAfter,
            opponentMaxHp,
            exGauge: toFiniteNumber(payload.ex_gauge, prev.exGauge),
            specialReady: Boolean(payload.special_ready ?? prev.specialReady),
            heatActive: Boolean(payload.heat_active ?? prev.heatActive),
          };
        });
        return;
      }
      if (payload.kind === 'ex_gauge_update' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => {
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const opponentMaxHp = toPositiveNumber(payload.opponent_max_hp, prev.opponentMaxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          const opponentHpAfter = clampHp(toFiniteNumber(payload.opponent_hp, prev.opponentHp), opponentMaxHp);
          // Sync local FSM so it can react to HP chunks (e.g. from special move damage over time)
          useFSMStore.getState().syncHp('local', hpAfter);
          useFSMStore.getState().syncHp('enemy', opponentHpAfter);
          return {
            ...prev,
            exGauge: toFiniteNumber(payload.value, prev.exGauge),
            specialReady: Boolean(payload.special_ready ?? prev.specialReady),
            hp: hpAfter,
            opponentHp: opponentHpAfter,
            maxHp,
            opponentMaxHp,
            heatActive: Boolean(payload.heat_active ?? prev.heatActive),
          };
        });
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
        const hpAfter = toFiniteNumber(payload.hp_after, 0);
        if (victim === PLAYER_ID) {
          useFSMStore.getState().syncHp('local', hpAfter);
          setBattleState(prev => {
            const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
            return { ...prev, hp: clampHp(hpAfter, maxHp), maxHp };
          });
        } else {
          useFSMStore.getState().syncHp('enemy', hpAfter);
          setBattleState(prev => {
            const opponentMaxHp = toPositiveNumber(payload.max_hp, prev.opponentMaxHp);
            return { ...prev, opponentHp: clampHp(hpAfter, opponentMaxHp), opponentMaxHp };
          });
        }
        return;
      }
      if (payload.kind === 'heat_state' && (!target || target === PLAYER_ID)) {
        setBattleState(prev => {
          const maxHp = toPositiveNumber(payload.max_hp, prev.maxHp);
          const hpAfter = clampHp(toFiniteNumber(payload.hp, prev.hp), maxHp);
          useFSMStore.getState().syncHp('local', hpAfter);
          return {
            ...prev,
            heatActive: Boolean(payload.active ?? prev.heatActive),
            hp: hpAfter,
            maxHp,
          };
        });
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
      if (payload.kind === 'proactive_line') {
        if (target && target !== PLAYER_ID) return;
        const line = String(payload.text ?? '').trim();
        if (line) {
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: line }
          }));
        }
        const action = String(payload.action ?? '');
        if (action === 'glow_eyes') {
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'Eye glow activated' }
          }));
        }
        return;
      }
      if (payload.kind === 'reject_item') {
        const reason = String(payload.reason ?? 'not_my_style');
        const count = Number(payload.reject_count ?? 0);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: `Item rejected (${reason}) x${count}` }
        }));
        return;
      }
      if (payload.kind === 'bgm_ready') {
        const url = String(payload.url ?? '');
        if (url) {
          setBgmUrl(url);
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: 'Victory BGM ready' }
          }));
        }
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
    if (evt.event === 'proactive_line' && payload && typeof payload === 'object') {
      const text = String((payload as any).text ?? '').trim();
      if (text) {
        window.dispatchEvent(new CustomEvent('show_subtitle', { detail: { text } }));
      }
      return;
    }
    if (evt.event === 'bgm_ready' && payload && typeof payload === 'object') {
      const url = String((payload as any).url ?? '');
      if (url) {
        setBgmUrl(url);
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: 'Victory BGM ready' }
        }));
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

  useEffect(() => {
    useArenaSyncStore.getState().clearCalibrations();
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    wsService.connect(WS_URL, PLAYER_ID, ROOM_ID, PLAYER_LANG, SYNC_RATE);
    rtcService.start(PLAYER_ID);
    return () => {
      rtcService.stop();
      wsService.disconnect();
    };
  }, []);

  useEffect(() => {
    const syncPeer = () => {
      useArenaSyncStore.getState().setPeerState(rtcService.getRemotePeerId());
    };
    const onPeerState = (event: Event) => {
      const detail = (event as CustomEvent<{ remoteId: string | null }>).detail;
      useArenaSyncStore.getState().setPeerState(detail?.remoteId ?? null);
    };
    syncPeer();
    window.addEventListener('webrtc_peer_state', onPeerState as EventListener);
    return () => {
      window.removeEventListener('webrtc_peer_state', onPeerState as EventListener);
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
    if (!matchAlignmentReady) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.alignPending }
      }));
      return;
    }
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
    <div className="arena-shell">
      <div className="arena-atmosphere" aria-hidden />

      {showLanguageChooser && (
        <div className="language-gate">
          <div className="language-gate-card">
            <h2>{t.chooseLanguage}</h2>
            <p>{t.chooseLanguageDesc}</p>
            <div className="language-gate-actions">
              <button
                className="hud-btn hud-btn-steel"
                onClick={() => applyLanguage('ja-JP', true)}
              >
                日本語
              </button>
              <button
                className="hud-btn hud-btn-blue"
                onClick={() => applyLanguage('en-US', true)}
              >
                English
              </button>
              <button
                className="hud-btn hud-btn-teal"
                onClick={() => applyLanguage('es-ES', true)}
              >
                Espanol
              </button>
            </div>
          </div>
        </div>
      )}

      {!isSetupDone && (
        <FaceScanner
          onGenerate={generateCharacter}
          isGenerating={isGenerating}
        />
      )}
      {CHARACTER_LAB_UI && profileInfo && (
        <CharacterLabPanel
          open={isLabOpen}
          onClose={() => setIsLabOpen(false)}
          baseDna={robotDna}
          material={robotMaterial}
          totalMatches={profileInfo.totalMatches}
          recentFeedbackCount={recentABFeedbackCount}
          onSubmit={(payload) => {
            submitDnaABFeedback(payload);
            setIsLabOpen(false);
          }}
        />
      )}

      <header className="hud-top-left hud-animate">
        <div className="hud-brand">
          <div className="hud-brand-main">PLARES AR</div>
          <div className="hud-brand-sub">{t.brandSub}</div>
        </div>
        <div className="hud-inline-actions">
          <button
            id="btn-enter-ar"
            className="hud-btn hud-btn-steel hud-btn-mini"
            onClick={() => store.enterAR()}
          >
            {t.enterAr}
          </button>
          {DEBUG_UI && (
            <button
              id="btn-match-end"
              className="hud-btn hud-btn-danger hud-btn-mini"
              onClick={requestMatchEnd}
            >
              {t.endMatch}
            </button>
          )}
          <button
            id="btn-arena-align"
            className="hud-btn hud-btn-blue hud-btn-mini"
            onClick={publishArenaCalibration}
          >
            {t.alignArena}
          </button>
          <button
            id="btn-menu-toggle"
            className="hud-btn hud-btn-carbon hud-btn-mini"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            {t.menu}
          </button>
          <button
            id="btn-arena-share"
            className="hud-btn hud-btn-teal hud-btn-mini"
            onClick={() => setIsShareOpen(true)}
          >
            {t.share}
          </button>
          {CHARACTER_LAB_UI && (
            <button
              id="btn-open-lab"
              className="hud-btn hud-btn-carbon hud-btn-mini"
              onClick={() => setIsLabOpen(true)}
            >
              Lab
            </button>
          )}
        </div>
      </header>

      {/* HP Bars overlay */}
      <div className="hud-health-bars">
        <div className="hud-hp-side is-local">
          <div className="hud-hp-label">{t.hp}</div>
          <div className="hud-hp-track">
            <div
              className={`hud-hp-fill ${localHp < 30 ? 'critical' : ''}`}
              style={{ width: `${isSolo ? localHp : (battleState.maxHp > 0 ? (battleState.hp / battleState.maxHp) * 100 : 0)}%` }}
            />
          </div>
        </div>
        <div className="hud-hp-vs">VS</div>
        <div className="hud-hp-side is-remote">
          <div className="hud-hp-label">{t.enemyHp}</div>
          <div className="hud-hp-track">
            <div
              className={`hud-hp-fill ${enemyHp < 30 ? 'critical' : ''}`}
              style={{ width: `${isSolo ? enemyHp : (battleState.opponentMaxHp > 0 ? (battleState.opponentHp / battleState.opponentMaxHp) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </div>

      <aside className={`hud-profile hud-animate ${isProfileOpen ? 'is-open' : ''}`}>
        <div className="hud-profile-title" onClick={() => setIsProfileOpen(!isProfileOpen)}>
          {t.pilotTelemetry}
        </div>
        <div className="hud-profile-actions">
          <div className={`hud-align-pill ${alignmentReady ? 'is-ready' : ''}`}>
            {alignmentReady ? t.alignReady : t.alignPending}
          </div>
          <label className="hud-lang-wrap">
            <span>{t.language}</span>
            <select
              className="hud-lang-select"
              value={selectedLanguage}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedLanguage(next);
                applyLanguage(next, true);
              }}
            >
              <option value="ja-JP">日本語</option>
              <option value="en-US">English</option>
              <option value="es-ES">Espanol</option>
            </select>
          </label>
        </div>
        <div className="hud-main-commands">
          <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={requestProfileSync}>
            {t.refreshMemory}
          </button>
          <button
            className={`hud-btn hud-btn-mini ${isLiveConnected ? 'hud-btn-green' : 'hud-btn-teal'}`}
            onClick={isLiveConnected ? disconnectLiveDirect : connectLiveDirect}
          >
            {isLiveConnected ? t.disconnectLive : t.connectLive}
          </button>
          <button
            className={`hud-btn hud-btn-mini ${isLiveMicActive ? 'hud-btn-warn' : 'hud-btn-blue'}`}
            onClick={toggleLiveMic}
          >
            {isLiveMicActive ? t.stopLiveMic : t.startLiveMic}
          </button>
          <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={sendLiveTextPing}>
            {t.sendLiveText}
          </button>
          <button className="hud-btn hud-btn-steel hud-btn-mini" onClick={requestInteractionTurn}>
            {t.testInteraction}
          </button>
        </div>
        <div className="hud-profile-grid">
          <span>{t.matches}</span><strong>{profileView.totalMatches}</strong>
          <span>{t.training}</span><strong>{profileView.totalTrainingSessions}</strong>
          <span>{t.walks}</span><strong>{profileView.totalWalkSessions}</strong>
          <span>{t.tone}</span><strong>{profileView.tone}</strong>
          <span>{t.sync}</span><strong>{profileView.syncRate.toFixed(2)}</strong>
          <span>{t.store}</span><strong>{profileView.storageBackend}</strong>
          <span>{t.hp}</span><strong>{`${battleState.hp}/${battleState.maxHp || '-'}`}</strong>
          <span>{t.enemyHp}</span><strong>{`${battleState.opponentHp}/${battleState.opponentMaxHp || '-'}`}</strong>
          <span>{t.heat}</span><strong>{battleState.heatActive ? 'ON' : 'OFF'}</strong>
        </div>
        <div className="hud-memory-line" title={profileView.memorySummary || ''}>
          {profileView.memorySummary || t.noMemory}
        </div>
        {profileView.recentLogs.length > 0 && (
          <div className="hud-block">
            {profileView.recentLogs.map((log, idx) => (
              <div key={`${log.timestamp}-${idx}`} className="hud-log-line">
                {`${log.result} C:${log.criticalHits} M:${log.misses}`}
              </div>
            ))}
          </div>
        )}
        {DEBUG_UI && (liveDebugInfo.tokenName || liveDebugInfo.interactionId || liveDebugInfo.interactionText || bgmUrl) && (
          <div className="hud-block hud-dim">
            {liveDebugInfo.tokenName && <div className="hud-truncate">{`Token: ${liveDebugInfo.tokenName}`}</div>}
            {liveDebugInfo.resumeHandle && <div className="hud-truncate">{`Resume: ${liveDebugInfo.resumeHandle}`}</div>}
            {liveDebugInfo.interactionId && <div className="hud-truncate">{`Interaction: ${liveDebugInfo.interactionId}`}</div>}
            {liveDebugInfo.interactionText && <div className="hud-truncate">{liveDebugInfo.interactionText}</div>}
            {bgmUrl && <div className="hud-truncate">{`BGM: ${bgmUrl}`}</div>}
          </div>
        )}
      </aside>

      {DEBUG_UI && (
        <div className="hud-right-rail hud-animate">
          <button id="btn-fusion-drop" className="hud-btn hud-btn-amber" onClick={requestFusionDrop}>
            {t.dropFusion}
          </button>
          <button id="btn-profile-sync" className="hud-btn hud-btn-carbon" onClick={requestProfileSync}>
            {t.refreshMemory}
          </button>
          <button id="btn-live-token" className="hud-btn hud-btn-blue" onClick={requestLiveEphemeralToken}>
            {t.issueLiveToken}
          </button>
          <button
            id="btn-live-connect"
            className={`hud-btn ${isLiveConnected ? 'hud-btn-green' : 'hud-btn-teal'}`}
            onClick={isLiveConnected ? disconnectLiveDirect : connectLiveDirect}
          >
            {isLiveConnected ? t.disconnectLive : t.connectLive}
          </button>
          <button
            id="btn-live-mic"
            className={`hud-btn ${isLiveMicActive ? 'hud-btn-warn' : 'hud-btn-blue'}`}
            onClick={toggleLiveMic}
          >
            {isLiveMicActive ? t.stopLiveMic : t.startLiveMic}
          </button>
          <button id="btn-live-text" className="hud-btn hud-btn-carbon" onClick={sendLiveTextPing}>
            {t.sendLiveText}
          </button>
          <button id="btn-interaction-turn" className="hud-btn hud-btn-steel" onClick={requestInteractionTurn}>
            {t.testInteraction}
          </button>
        </div>
      )}

      <button
        id="btn-cast-special"
        className={`hud-btn hud-cast-btn ${(isStreaming || isMatchPaused || !battleState.specialReady || !matchAlignmentReady) ? 'is-disabled' : ''}`}
        disabled={isStreaming || isMatchPaused || !battleState.specialReady || !matchAlignmentReady}
        onClick={handleCastSpecial}
      >
        {isMatchPaused
          ? t.matchPaused
          : (!matchAlignmentReady
            ? t.alignPending
            : (isStreaming ? t.casting : (battleState.specialReady ? t.castSpecial : `EX ${battleState.exGauge}/${EX_GAUGE.MAX}`)))}
      </button>

      {DEBUG_UI && (
        <button
          id="btn-p2p-media"
          className={`hud-btn hud-chip-btn ${isP2PMediaOn ? 'is-on' : 'is-off'}`}
          onClick={toggleP2PMedia}
        >
          {isP2PMediaOn ? t.p2pOn : t.p2pOff}
        </button>
      )}



      <Canvas
        className="arena-canvas"
        shadows
        camera={{ position: [0, 1.55, 3.2], fov: 48, near: 0.01, far: 100 }}
      >
        <XR store={store}>
          <MainScene />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping={false}
            autoRotate={false}
          />
        </XR>
      </Canvas>

      <ServerDrivenPanel />
      <DynamicSubtitle />
      <RemoteStreamView />
      <ShareArenaModal
        roomId={ROOM_ID}
        uiLang={uiLang}
        open={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    </div>
  );
}

export default App;
