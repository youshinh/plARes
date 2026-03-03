import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore, useXR } from '@react-three/xr';
import { Environment, OrbitControls } from '@react-three/drei';
import { RobotCharacter } from './components/RobotCharacter';
import { RemoteRobotCharacter } from './components/RemoteRobotCharacter';
import { FaceScanner } from './components/FaceScanner';
import { ServerDrivenPanel } from './components/ui/ServerDrivenPanel';
import { AnimationDebugPanel } from './components/ui/AnimationDebugPanel';
import { DynamicSubtitle } from './components/ui/DynamicSubtitle';
import { RemoteStreamView } from './components/ui/RemoteStreamView';
import { CharacterLabPanel } from './components/ui/CharacterLabPanel';
import { ShareArenaModal } from './components/ui/ShareArenaModal';
import { ScanGuideOverlay } from './components/ui/ScanGuideOverlay';
import { FusionCraftModal } from './components/ui/FusionCraftModal';
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
const STORAGE_PLAY_MODE_KEY = 'plares_play_mode';
const IS_ANDROID_CHROME = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) && /chrome/i.test(ua);
})();
const SHADOWS_ENABLED = !IS_ANDROID_CHROME;
const xrResizeGuardInstalled = new WeakSet<THREE.WebGLRenderer>();

// ── Multi-language configuration ─────────────────────────────────────────────
// To add a new language: add one entry to LANG_OPTIONS with its BCP-47 code.
// If the language is NOT in UI_TEXT, translations will be auto-generated via
// Gemini (gemini-flash-lite-latest) on first selection and cached in
// localStorage so subsequent loads are instant.
export type LangOption = {
  /** BCP-47 code sent to backend, e.g. "fr-FR" */
  code: string;
  /** Native script label shown in the picker */
  label: string;
  /** ISO 639-1 key used to look up UI_TEXT */
  dictKey: 'ja' | 'en' | 'es';
};

type UiLang = 'ja' | 'en' | 'es';

// ── Supported languages ───────────────────────────────────────────────────────
// Add new rows here; the picker will show them automatically.
// dictKey determines which built-in dictionary is the base for Gemini translation.
export const LANG_OPTIONS: LangOption[] = [
  { code: 'ja-JP', label: '日本語', dictKey: 'ja' },
  { code: 'en-US', label: 'English', dictKey: 'en' },
  { code: 'es-ES', label: 'Español', dictKey: 'es' },
  { code: 'zh-CN', label: '中文（简体）', dictKey: 'en' },
  { code: 'ko-KR', label: '한국어', dictKey: 'en' },
  { code: 'fr-FR', label: 'Français', dictKey: 'en' },
  { code: 'de-DE', label: 'Deutsch', dictKey: 'en' },
  { code: 'pt-BR', label: 'Português', dictKey: 'en' },
];

/** BCP-47 prefix → dict key (for built-in ja/en/es) */
const BUILTIN_LANG_MAP: Record<string, UiLang> = {
  ja: 'ja',
  es: 'es',
};

const toUiLang = (raw: string): UiLang => {
  const value = (raw || '').toLowerCase();
  const prefix = value.substring(0, 2);
  return BUILTIN_LANG_MAP[prefix] ?? 'en';
};

// ── Dynamic translation cache (localStorage) ──────────────────────────────────
const STORAGE_TRANSLATED_PREFIX = 'plares_ui_trans_';

const loadCachedTranslations = (bcp47: string): Record<string, string> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_TRANSLATED_PREFIX + bcp47);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const saveCachedTranslations = (bcp47: string, dict: Record<string, string>): void => {
  try {
    localStorage.setItem(STORAGE_TRANSLATED_PREFIX + bcp47, JSON.stringify(dict));
  } catch {
    // storage quota; noop
  }
};

type PlayMode = 'match' | 'training' | 'walk';

type ModeSession = {
  id: string;
  startedAt: string;
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const formatArEnterError = (error: unknown, lang: UiLang): string => {
  const ja = lang === 'ja';
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return ja
        ? 'AR開始にはカメラ権限が必要です。Chromeのサイト権限を確認してください。'
        : 'Camera permission is required to start AR. Please check Chrome site permissions.';
    }
    if (error.name === 'NotSupportedError') {
      return ja
        ? 'この端末またはブラウザではWebXR ARが利用できません。'
        : 'WebXR AR is not supported on this device or browser.';
    }
    if (error.name === 'SecurityError') {
      return ja
        ? 'AR開始にはHTTPS接続が必要です。'
        : 'HTTPS is required to start AR.';
    }
  }
  return ja
    ? 'ARセッションの開始に失敗しました。ページ再読み込み後に再実行してください。'
    : 'Failed to start AR session. Reload the page and try again.';
};

const createModeSessionId = (prefix: 'training' | 'walk') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const clampHp = (value: number, maxHp: number): number =>
  Math.max(0, Math.min(value, maxHp));

const installXrPresentationGuards = (renderer: THREE.WebGLRenderer) => {
  if (xrResizeGuardInstalled.has(renderer)) return;

  const originalSetSize = renderer.setSize.bind(renderer);
  const originalSetPixelRatio = renderer.setPixelRatio.bind(renderer);
  let pendingSize: { width: number; height: number; updateStyle?: boolean } | null = null;
  let pendingPixelRatio: number | null = null;

  renderer.setSize = ((width: number, height: number, updateStyle?: boolean) => {
    if (renderer.xr.isPresenting) {
      pendingSize = { width, height, updateStyle };
      return renderer;
    }
    return originalSetSize(width, height, updateStyle);
  }) as THREE.WebGLRenderer['setSize'];

  renderer.setPixelRatio = ((value: number) => {
    if (renderer.xr.isPresenting) {
      pendingPixelRatio = value;
      return;
    }
    originalSetPixelRatio(value);
  }) as THREE.WebGLRenderer['setPixelRatio'];

  const flushPending = () => {
    if (pendingPixelRatio !== null) {
      originalSetPixelRatio(pendingPixelRatio);
      pendingPixelRatio = null;
    }
    if (pendingSize) {
      originalSetSize(pendingSize.width, pendingSize.height, pendingSize.updateStyle);
      pendingSize = null;
    }
  };
  renderer.xr.addEventListener('sessionend', flushPending);

  xrResizeGuardInstalled.add(renderer);
};

const UI_TEXT: Record<UiLang, Record<string, string>> = {
  ja: {
    brandSub: '次世代AIエージェントバトル',
    language: '言語',
    chooseLanguage: '表示言語を選択',
    chooseLanguageDesc: '最初に使う言語を選んでください。後で変更できます。',
    enterAr: 'AR開始',
    arChecking: 'AR確認中',
    arUnavailable: 'AR非対応',
    arUnsupportedHint: 'この端末ではWebXR ARが使えません。通常表示モードでご利用ください。',
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
    mode: 'モード',
    modeMatch: '試合',
    modeTraining: '修行',
    modeWalk: '散歩',
    startTraining: '修行開始',
    completeTraining: '修行完了',
    startWalk: '散歩開始',
    completeWalk: '散歩完了',
    sendWalkVision: '散歩トリガー',
    trainingNotStarted: '修行セッションが開始されていません',
    walkNotStarted: '散歩セッションが開始されていません',
    walkOnlyHint: '散歩モード中に利用できます',
    voiceAckPrefix: '音声',
    voiceCmdSpecial: '必殺技',
    voiceCmdDodge: '回避',
    voiceCmdForward: '前進',
    voiceCmdAttack: '攻撃',
    voiceCmdFlank: '回り込み',
    menu: 'メニュー',
    share: '共有 (QR)',
  },
  en: {
    brandSub: 'Next-Gen AI Agent Arena',
    language: 'Language',
    chooseLanguage: 'Choose your language',
    chooseLanguageDesc: 'Pick your default UI language. You can change this later.',
    enterAr: 'Enter AR',
    arChecking: 'Checking AR',
    arUnavailable: 'AR Unsupported',
    arUnsupportedHint: 'WebXR AR is not available on this device. Continue in standard view mode.',
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
    mode: 'Mode',
    modeMatch: 'Match',
    modeTraining: 'Training',
    modeWalk: 'Walk',
    incantationStart: 'Start Incantation ⚡',
    twistTitle: 'Tongue Twister:',
    startTraining: 'Start Training',
    completeTraining: 'Complete Training',
    startWalk: 'Start Walk',
    completeWalk: 'Complete Walk',
    sendWalkVision: 'Walk Trigger',
    trainingNotStarted: 'Training session has not started.',
    walkNotStarted: 'Walk session has not started.',
    walkOnlyHint: 'Available only in walk mode.',
    voiceAckPrefix: 'Voice',
    voiceCmdSpecial: 'Special',
    voiceCmdDodge: 'Dodge',
    voiceCmdForward: 'Forward',
    voiceCmdAttack: 'Attack',
    voiceCmdFlank: 'Flank',
    menu: 'Menu',
    share: 'Share (QR)',
  },
  es: {
    brandSub: 'Arena de Agentes IA',
    language: 'Idioma',
    chooseLanguage: 'Elige tu idioma',
    chooseLanguageDesc: 'Selecciona el idioma inicial de la interfaz. Puedes cambiarlo despues.',
    enterAr: 'Entrar AR',
    arChecking: 'Verificando AR',
    arUnavailable: 'AR no compatible',
    arUnsupportedHint: 'WebXR AR no esta disponible en este dispositivo. Usa el modo de vista normal.',
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
    mode: 'Modo',
    modeMatch: 'Partida',
    modeTraining: 'Entreno',
    modeWalk: 'Paseo',
    incantationStart: 'Iniciar Encantamiento ⚡',
    twistTitle: 'Trabalenguas:',
    startTraining: 'Iniciar Entreno',
    completeTraining: 'Completar Entreno',
    startWalk: 'Iniciar Paseo',
    completeWalk: 'Completar Paseo',
    sendWalkVision: 'Disparar Paseo',
    trainingNotStarted: 'La sesion de entrenamiento no ha comenzado.',
    walkNotStarted: 'La sesion de paseo no ha comenzado.',
    walkOnlyHint: 'Disponible solo en modo paseo.',
    voiceAckPrefix: 'Voz',
    voiceCmdSpecial: 'Especial',
    voiceCmdDodge: 'Esquivar',
    voiceCmdForward: 'Avanzar',
    voiceCmdAttack: 'Atacar',
    voiceCmdFlank: 'Flanquear',
    menu: 'Menu',
    share: 'Compartir (QR)',
  },
};

const store = createXRStore({
  // Request AR features through @pmndrs/xr session-init options.
  // local-floor is a reference space requested in useWebXRScanner.
  hitTest: true,
  depthSensing: false,
  layers: false,
  meshDetection: false,
  planeDetection: false,
});

// ── Inner scene (must render inside Canvas + XR) ─────────────────────────────
const MainScene: React.FC = () => {
  const { session } = useXR();
  const { hoverMatrix, depthTexture, depthRawToMeters } = useWebXRScanner();
  useVoiceController();
  useAICommandListener();

  // Listen for NavMesh ready event (fired by useWebXRScanner once point-cloud is dense)
  useEffect(() => {
    const handler = async (e: Event) => {
      const points = (e as CustomEvent<THREE.Vector3[]>).detail;
      await navMesh.buildFromPoints(points);
      
      // Send local navmesh to remote peer
      if (rtcService.isOpen()) {
        const plainPoints = points.map(p => ({ x: p.x, y: p.y, z: p.z }));
        rtcService.sendNavMesh(plainPoints);
      }
    };
    window.addEventListener('navmesh_ready', handler);
    return () => window.removeEventListener('navmesh_ready', handler);
  }, []);

  // Listen for remote NavMesh ready event (received via WebRTC)
  useEffect(() => {
    const handler = async (e: Event) => {
      const pointsData = (e as CustomEvent<{x: number, y: number, z: number}[]>).detail;
      if (Array.isArray(pointsData)) {
        console.info('[NavMesh] Received remote navmesh points, building local navmesh...');
        const points = pointsData.map(p => new THREE.Vector3(p.x, p.y, p.z));
        await navMesh.buildFromPoints(points);
        window.dispatchEvent(
          new CustomEvent('show_subtitle', { detail: { text: 'Remote NavMesh loaded' } })
        );
      }
    };
    window.addEventListener('remote_navmesh_ready', handler);
    return () => window.removeEventListener('remote_navmesh_ready', handler);
  }, []);

  // Listen for automated environment detection from useWebXRScanner
  const playMode = useFSMStore(s => s.playMode);
  useEffect(() => {
    const handler = (e: Event) => {
      const { trigger, context } = (e as CustomEvent).detail;
      if (playMode === 'walk') {
        console.info(`[Vision] Auto-trigger detected: ${trigger} (${context})`);
        wsService.sendEvent({
          event: 'walk_vision_trigger',
          user: PLAYER_ID,
          target: PLAYER_ID,
          payload: { trigger, context: `auto_${context}` }
        });
      }
    };
    window.addEventListener('vision_trigger_detected', handler);
    return () => window.removeEventListener('vision_trigger_detected', handler);
  }, [playMode]);

  // Placement indicator at the current hit-test surface point
  const indicatorPos = hoverMatrix
    ? new THREE.Vector3().setFromMatrixPosition(hoverMatrix)
    : null;
  const showGround = !session || session.environmentBlendMode === 'opaque';

  return (
    <>
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#CFE8FF', '#1B2634', 0.8]} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={1.4}
        castShadow={SHADOWS_ENABLED}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-2.5, 1.8, 2.2]} intensity={0.9} color="#7BC8FF" />
      <pointLight position={[2.2, 1.1, -1.5]} intensity={0.55} color="#FFB26B" />
      <Environment preset="sunset" />
      <RobotCharacter />
      <RemoteRobotCharacter depthTexture={depthTexture} depthRawToMeters={depthRawToMeters} />

      {/* Hit-test placement ring */}
      {indicatorPos && (
        <mesh position={indicatorPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#00ffff" side={2} />
        </mesh>
      )}

      {/* Ground should stay hidden in AR camera view; keep it for VR/non-XR. */}
      {showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={SHADOWS_ENABLED}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#2C313A" roughness={0.86} metalness={0.08} />
        </mesh>
      )}
    </>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const uiLang = toUiLang(PLAYER_LANG);
  // Merge built-in dictionary with any Gemini-generated cached translations.
  // For ja/en/es the cache will be empty so this is a no-op.
  const cachedDynamic = loadCachedTranslations(PLAYER_LANG);
  const t = cachedDynamic
    ? { ...UI_TEXT[uiLang], ...cachedDynamic } as typeof UI_TEXT['en']
    : UI_TEXT[uiLang];
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
  const [arSupportState, setArSupportState] = useState<'checking' | 'supported' | 'unsupported'>('checking');
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
  const [voiceAckText, setVoiceAckText] = useState('');
  const { playMode, setPlayMode } = useFSMStore();
  const switchMode = (mode: PlayMode) => {
    setPlayMode(mode);
  };
  const [trainingSession, setTrainingSession] = useState<ModeSession | null>(null);
  const [walkSession, setWalkSession] = useState<ModeSession | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [recentABFeedbackCount, setRecentABFeedbackCount] = useState(0);
  const [bgmUrl, setBgmUrl] = useState('');
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // T1-4: scan state for AR plane detection guide
  const [scanState, setScanState] = useState<'idle' | 'searching' | 'tracking' | 'ready' | 'unsupported'>('idle');
  const [scanPointCount, setScanPointCount] = useState(0);
  const [isARSessionActive, setIsARSessionActive] = useState(false);
  
  useEffect(() => {
    console.info(`[App] AR Session State changed: ${isARSessionActive}, Scan State: ${scanState}`);
  }, [isARSessionActive, scanState]);
  
  // Debug panel toggle (visible to all, toggled by header button)
  const [debugVisible, setDebugVisible] = useState(DEBUG_UI);
  // Phase Management: 0=Lang, 1=Scan(Setup), 2=Summon(AR Init), 3=Main
  const [appPhase, setAppPhase] = useState<'lang' | 'scan' | 'summon' | 'main'>(() => {
    try {
      if (!localStorage.getItem(STORAGE_LANG_SELECTED_KEY)) return 'lang';
      // We will let the effect below advance from 'scan' -> 'summon' -> 'main'
      return 'scan';
    } catch {
      return 'lang';
    }
  });

  // Advance phase based on setup completion
  useEffect(() => {
    if (appPhase === 'scan' && isSetupDone) {
      setAppPhase('summon');
    }
  }, [appPhase, isSetupDone]);

  // Resolve the active BCP-47 code from LANG_OPTIONS (falls back to en-US).
  const [selectedLanguage, setSelectedLanguage] = useState<string>(
    LANG_OPTIONS.find(o => PLAYER_LANG.startsWith(o.code.substring(0, 2)))?.code ?? 'en-US'
  );
  const [battleState, setBattleState] = useState({
    hp: 100,
    maxHp: 100,
    opponentHp: 100,
    opponentMaxHp: 100,
    exGauge: 0,
    specialReady: false,
    heatActive: false,
  });
  const [showFusionCraft, setShowFusionCraft] = useState(false);
  const pendingLiveConnectRef = useRef(false);
  const castEndsAtRef = useRef<number>(0);
  const specialRetryRef = useRef(0);
  const judgeTimeoutRef = useRef<number | null>(null);
  const voiceAckTimerRef = useRef<number | null>(null);
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
      console.info(`[App] Language applied: ${langCode} (chosen: ${markAsChosen})`);
    } catch (err) {
      console.warn('[App] Failed to save language choice', err);
    }
    // For built-in languages (ja, en, es) → reload immediately.
    // For dynamic languages → check cache first; if no cache, request Gemini translation.
    const builtInPrefixes = ['ja', 'en', 'es'];
    const prefix = langCode.substring(0, 2).toLowerCase();
    const hasBuiltIn = builtInPrefixes.includes(prefix);
    const existingCache = loadCachedTranslations(langCode);
    console.info(`[App] Checking translation for ${langCode} - BuiltIn: ${hasBuiltIn}, Cached: ${!!existingCache}`);
    if (hasBuiltIn || existingCache) {
      console.info(`[App] Reloading to apply translations immediately`);
      window.location.reload();
      return;
    }
    // Request Gemini to generate translations (gemini-flash-lite-latest on backend)
    const option = LANG_OPTIONS.find(o => o.code === langCode);
    const baseDict = UI_TEXT[option?.dictKey ?? 'en'];
    wsService.sendEvent({
      event: 'request_ui_translations',
      user: PLAYER_ID,
      payload: { lang: langCode, base_keys: baseDict as unknown as Record<string, string> },
    });
    // Show a loading subtitle while waiting for the response
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: `Generating ${langCode} translations…` }
    }));
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PLAY_MODE_KEY, playMode);
    } catch {
      // noop
    }
  }, [playMode]);

  const modeLabel =
    playMode === 'training' ? t.modeTraining :
    playMode === 'walk' ? t.modeWalk :
    t.modeMatch;

  const startTraining = () => {
    const session: ModeSession = {
      id: createModeSessionId('training'),
      startedAt: new Date().toISOString(),
    };
    setTrainingSession(session);
    switchMode('training');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: `${t.startTraining} (#${session.id.slice(-6)})` },
    }));
  };

  const completeTraining = () => {
    if (!trainingSession) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.trainingNotStarted },
      }));
      return;
    }
    const endedAt = new Date().toISOString();
    wsService.sendEvent({
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: {
        kind: 'training_complete',
        sessionId: trainingSession.id,
        startedAt: trainingSession.startedAt,
        endedAt,
        drillType: 'voice_reaction',
        result: battleState.hp > 0 ? 'SUCCESS' : 'FAILURE',
        accuracyScore: Number(Math.min(1, Math.max(0, battleState.exGauge / EX_GAUGE.MAX)).toFixed(3)),
        speedScore: Number(Math.min(1, Math.max(0, profileView.syncRate)).toFixed(3)),
        passionScore: Number((battleState.heatActive ? 0.85 : 0.55).toFixed(3)),
        retryCount: 0,
        highlights: [
          `hp:${battleState.hp}/${battleState.maxHp}`,
          `enemy:${battleState.opponentHp}/${battleState.opponentMaxHp}`,
          `ex:${battleState.exGauge}`,
        ],
        aiComment: 'Training completed from frontend HUD',
        syncRateAfter: profileView.syncRate,
      },
    });
    setTrainingSession(null);
    switchMode('match');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.completeTraining },
    }));
  };

  const startWalk = () => {
    const session: ModeSession = {
      id: createModeSessionId('walk'),
      startedAt: new Date().toISOString(),
    };
    setWalkSession(session);
    switchMode('walk');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: `${t.startWalk} (#${session.id.slice(-6)})` },
    }));
  };

  const completeWalk = () => {
    if (!walkSession) {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.walkNotStarted },
      }));
      return;
    }
    const endedAt = new Date().toISOString();
    wsService.sendEvent({
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: {
        kind: 'walk_complete',
        sessionId: walkSession.id,
        startedAt: walkSession.startedAt,
        endedAt,
        routeSummary: 'HUD walk route',
        foundItems: [],
        proactiveAudioHighlights: [],
        visionTriggers: [],
        aiComment: 'Walk completed from frontend HUD',
        syncRateAfter: profileView.syncRate,
      },
    });
    setWalkSession(null);
    switchMode('match');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.completeWalk },
    }));
  };

  const sendWalkVisionTrigger = () => {
    if (playMode !== 'walk') {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.walkOnlyHint },
      }));
      return;
    }
    wsService.sendEvent({
      event: 'walk_vision_trigger',
      user: PLAYER_ID,
      target: PLAYER_ID,
      payload: {
        trigger: 'environment',
        context: 'manual_hud_trigger',
      },
    });
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.sendWalkVision },
    }));
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

    if (evt.event === 'hit_confirmed' && evt.user !== PLAYER_ID) {
      const damage = Number((payload as any)?.damage ?? 0);
      if (damage > 0) {
        // Attacker Authority: The remote peer confirmed a hit on us.
        useFSMStore.getState().takeDamage('local', damage);
      }
      return;
    }

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
        console.groupCollapsed('[App] Profile Sync Received');
        console.dir(payload.profile);
        console.groupEnd();
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
        useFSMStore.getState().setRejectItem();
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
        const action = typeof payload.action === 'string' ? payload.action : '';
        const url = typeof payload.texture_url === 'string' ? payload.texture_url : '';
        
        if (action === 'equip' && url) {
          // Update local DNA skin to instantly apply the new texture
          const currentDna = useFSMStore.getState().robotDna;
          setRobotDna({ ...currentDna, skinUrl: url });
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: `Equipped Fusion Drop: ${concept}` }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('show_subtitle', {
            detail: { text: `Fusion Drop: ${concept}` }
          }));
        }
        return;
      }
      if (payload.kind === 'intervention_rejected') {
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: String(payload.message ?? 'Intervention rejected') }
        }));
        return;
      }
      if (payload.kind === 'ui_translations' && (!target || target === PLAYER_ID)) {
        const langCode = String(payload.lang ?? '');
        const dict = payload.translations;
        if (langCode && dict && typeof dict === 'object') {
          saveCachedTranslations(langCode, dict as Record<string, string>);
          // Reload so the cached translations are immediately applied
          window.location.reload();
        }
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
              // Inject robot tone as system instruction (Flow1 §4.3)
              const robotTone = String(
                useFSMStore.getState().robotMeta.tone ?? 'balanced'
              );
              const systemInstruction =
                `You are an AR battle robot companion. Language: ${PLAYER_LANG}. ` +
                `Persona tone: ${robotTone}. ` +
                `Speak naturally in short phrases. Stay in character.`;
              geminiLiveService.connect({
                tokenName,
                model: String(payload.model ?? 'gemini-2.5-flash-native-audio-preview-12-2025'),
                systemInstruction,
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

  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr || typeof xr.isSessionSupported !== 'function') {
      setArSupportState('unsupported');
      return;
    }

    xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (!cancelled) {
          setArSupportState(supported ? 'supported' : 'unsupported');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArSupportState('unsupported');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnterAr = async () => {
    if (arSupportState !== 'supported') {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.arUnsupportedHint }
      }));
      return;
    }
    try {
      await store.enterAR();
    } catch (error) {
      console.error('[XR] enterAR failed:', error);
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: formatArEnterError(error, uiLang) }
      }));
    }
  };

  const requestLiveEphemeralToken = () => {
    wsService.requestEphemeralToken({
        request_id: `req_${Date.now()}`,
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        response_modalities: ['AUDIO', 'TEXT'],
        session_resumption: true,
        store: false,
    });
  };

  const requestInteractionTurn = () => {
    wsService.requestInteractionTurn({
        request_id: `req_${Date.now()}`,
        input: '現在の戦況で次の一手を一文で提案してください。',
        model: 'models/gemini-3-flash-preview',
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
          model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
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

  // T2-4: BGM audio playback when bgm_ready event provides a URL
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      bgmAudioRef.current = null;
    }
    if (!bgmUrl) return;
    const audio = new Audio(bgmUrl);
    audio.volume = 0.5;
    audio.loop = false;
    bgmAudioRef.current = audio;
    audio.play().catch((err) => {
      console.warn('[BGM] Autoplay blocked or load failed:', err);
    });
    return () => {
      audio.pause();
      audio.src = '';
      bgmAudioRef.current = null;
    };
  }, [bgmUrl]);

  // T1-4: AR scan state listener for ScanGuideOverlay
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        scanState?: 'idle' | 'searching' | 'tracking' | 'ready' | 'unsupported';
        pointCount?: number;
        sessionActive?: boolean;
      }>).detail;
      if (!detail) return;
      setScanState(detail.scanState ?? 'idle');
      setScanPointCount(Number(detail.pointCount ?? 0));
      setIsARSessionActive(Boolean(detail.sessionActive));
    };
    window.addEventListener('scan_state_change', handler);
    return () => window.removeEventListener('scan_state_change', handler);
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const enableShadows = SHADOWS_ENABLED && !isARSessionActive;
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.autoUpdate = enableShadows;
  }, [isARSessionActive]);

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
    const commandLabels: Record<string, string> = {
      special: t.voiceCmdSpecial,
      dodge: t.voiceCmdDodge,
      forward: t.voiceCmdForward,
      attack: t.voiceCmdAttack,
      flank: t.voiceCmdFlank,
    };

    const onVoiceFeedback = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string }>).detail;
      const command = detail?.command ?? '';
      const label = commandLabels[command];
      if (!label) return;

      setVoiceAckText(`${t.voiceAckPrefix}: ${label}`);
      if (voiceAckTimerRef.current !== null) {
        clearTimeout(voiceAckTimerRef.current);
      }
      voiceAckTimerRef.current = window.setTimeout(() => {
        setVoiceAckText('');
        voiceAckTimerRef.current = null;
      }, 1600);
    };

    window.addEventListener('voice_command_feedback', onVoiceFeedback as EventListener);
    return () => {
      window.removeEventListener('voice_command_feedback', onVoiceFeedback as EventListener);
      if (voiceAckTimerRef.current !== null) {
        clearTimeout(voiceAckTimerRef.current);
        voiceAckTimerRef.current = null;
      }
    };
  }, [t]);

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
      console.info('[Special] blocked: arena alignment pending');
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: t.alignPending }
      }));
      return;
    }
    if (isMatchPaused) {
      console.info('[Special] blocked: match is paused');
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: '試合が一時停止中です' }
      }));
      return;
    }
    if (!battleState.specialReady) {
      console.info(`[Special] blocked: EX gauge ${battleState.exGauge}/${EX_GAUGE.MAX}`);
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
    console.info('[Special] casting started');

    // 2) Visual feedback starts immediately while backend inference runs in parallel
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: localizeCastStart(specialPhrase || undefined) }
    }));

    // 3) Sync casting start so the opponent can render the same charge phase
    const castPayload: any = { action: 'casting_special' };
    if (playMode === 'training' && specialPhrase) {
      // Flow2 §3.2 logic: Send event to trigger Articulation Judge Agent
      wsService.sendEvent({
        event: 'incantation_submitted',
        user: PLAYER_ID,
        payload: { phrase: specialPhrase }
      });
      castPayload.kind = 'incantation_request';
      castPayload.phrase = specialPhrase;
    }

    const castEvent = {
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: castPayload
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

  useEffect(() => {
    const onVoiceCastSpecial = () => {
      void handleCastSpecial();
    };
    window.addEventListener('voice_cast_special', onVoiceCastSpecial as EventListener);
    return () => {
      window.removeEventListener('voice_cast_special', onVoiceCastSpecial as EventListener);
    };
  }, [handleCastSpecial]);

  const isArButtonDisabled = arSupportState !== 'supported';
  const arButtonLabel =
    arSupportState === 'checking'
      ? t.arChecking
      : (isArButtonDisabled ? t.arUnavailable : t.enterAr);
  const arButtonTitle =
    arSupportState === 'checking'
      ? 'Checking AR support...'
      : (isArButtonDisabled ? t.arUnsupportedHint : t.enterAr);

  return (
    <div className="arena-shell">
      <div className="arena-atmosphere" aria-hidden />

      {appPhase === 'lang' && (
        <div className="language-gate">
          <div className="language-gate-card">
            <h2>{t.chooseLanguage}</h2>
            <p>{t.chooseLanguageDesc}</p>
            <div className="language-gate-grid">
              {LANG_OPTIONS.map(opt => {
                const isActive = selectedLanguage === opt.code;
                return (
                  <button
                    key={opt.code}
                    className={`hud-btn language-gate-lang-btn${isActive ? ' is-active' : ''}`}
                    onClick={() => applyLanguage(opt.code, true)}
                    aria-label={opt.label}
                  >
                    {isActive && <span className="language-gate-check" aria-hidden>✓</span>}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {playMode === 'walk' && (
        <div className="hud-training-actions">
          <button 
            className="hud-btn-special" 
            onClick={() => setShowFusionCraft(true)}
            style={{ background: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)' }}
          >
            Fusion Craft
          </button>
          <button className="hud-btn-special" onClick={sendWalkVisionTrigger}>
            {t.sendWalkVision}
          </button>
        </div>
      )}
      {playMode === 'training' && !!trainingSession && specialPhrase && (
        <div className="hud-twist-telop">
          {t.twistTitle} {specialPhrase}
        </div>
      )}

      {playMode === 'training' && !!trainingSession && (
        <div className="hud-training-actions">
          <button
            className={`hud-btn hud-btn-special ${!battleState.specialReady ? 'is-disabled' : ''}`}
            onClick={handleCastSpecial}
            disabled={!battleState.specialReady}
          >
            {t.incantationStart}
          </button>
        </div>
      )}

      {appPhase === 'scan' && (
        <FaceScanner
          onGenerate={generateCharacter}
          isGenerating={isGenerating}
        />
      )}
      
      {appPhase === 'summon' && (
        <div className="summon-overlay">
          <h2>Phase 1.3: First Summoning</h2>
          <p>Scan your real-world environment to summon your AI partner.</p>
          <button 
            id="btn-summon-ar"
            className={`hud-btn hud-btn-special ${arSupportState === 'checking' ? 'is-disabled' : ''}`}
            onClick={() => {
              if (arSupportState === 'supported') {
                handleEnterAr();
              }
              setAppPhase('main'); // Advance to main menu
            }}
            disabled={arSupportState === 'checking'}
            title={arSupportState === 'checking' ? 'Checking AR support...' : ''}
            style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)', color: '#333' }}
          >
            {arSupportState === 'supported' ? t.enterAr : 'Proceed to Main Menu (AR Not Supported)'}
          </button>
          
          {arSupportState === 'supported' && (
            <button 
              className="hud-btn hud-btn-carbon" 
              onClick={() => setAppPhase('main')}
            >
              Skip AR Summoning
            </button>
          )}
        </div>
      )}

      {CHARACTER_LAB_UI && profileInfo && appPhase === 'main' && (
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

      {appPhase === 'main' && (
        <>
          <header className="hud-top-left hud-animate">
            <div className="hud-brand">
              <div className="hud-brand-main">PLARES AR</div>
              <div className="hud-brand-sub">{t.brandSub}</div>
            </div>
            <div className="hud-inline-actions">
              <button
                id="btn-enter-ar"
                className={`hud-btn hud-btn-steel hud-btn-mini ${isArButtonDisabled ? 'is-disabled' : ''}`}
                onClick={handleEnterAr}
                disabled={isArButtonDisabled}
                title={arButtonTitle}
              >
                {arButtonLabel}
              </button>
              {debugVisible && (
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
              <button
                id="btn-debug-toggle"
                className={`hud-btn hud-btn-mini ${debugVisible ? 'hud-btn-warn' : 'hud-btn-carbon'}`}
                onClick={() => setDebugVisible(v => !v)}
                title="Toggle debug panels"
              >
                {debugVisible ? '🛠 DEBUG ON' : '🛠 DEBUG'}
              </button>
            </div>
          </header>

          <FusionCraftModal 
            isOpen={showFusionCraft} 
            onClose={() => setShowFusionCraft(false)} 
          />

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
            </div>
            <div className="hud-main-commands">
              <button
                className={`hud-btn hud-btn-mini ${playMode === 'match' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
                onClick={() => switchMode('match')}
              >
                {t.modeMatch}
              </button>
              <button
                className={`hud-btn hud-btn-mini ${playMode === 'training' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
                onClick={() => switchMode('training')}
              >
                {t.modeTraining}
              </button>
              <button
                className={`hud-btn hud-btn-mini ${playMode === 'walk' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
                onClick={() => switchMode('walk')}
              >
                {t.modeWalk}
              </button>
              <button
                className="hud-btn hud-btn-steel hud-btn-mini"
                onClick={playMode === 'walk' ? sendWalkVisionTrigger : requestProfileSync}
              >
                {playMode === 'walk' ? t.sendWalkVision : t.refreshMemory}
              </button>
              <button
                className={`hud-btn hud-btn-mini ${playMode === 'training' ? 'hud-btn-teal' : 'hud-btn-carbon'}`}
                onClick={trainingSession ? completeTraining : startTraining}
              >
                {trainingSession ? t.completeTraining : t.startTraining}
              </button>
              <button
                className={`hud-btn hud-btn-mini ${playMode === 'walk' ? 'hud-btn-teal' : 'hud-btn-carbon'}`}
                onClick={walkSession ? completeWalk : startWalk}
              >
                {walkSession ? t.completeWalk : t.startWalk}
              </button>
            </div>
            <div className="hud-profile-grid">
              <span>{t.mode}</span><strong>{modeLabel}</strong>
              <span>AR</span><strong>{isARSessionActive ? `${scanState} (${scanPointCount})` : 'OFF'}</strong>
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
            {debugVisible && (liveDebugInfo.tokenName || liveDebugInfo.interactionId || liveDebugInfo.interactionText || bgmUrl) && (
              <div className="hud-block hud-dim" style={{ borderLeft: '2px solid #ff6b6b' }}>
                <div style={{ fontSize: '0.6rem', color: '#ff6b6b', fontWeight: 700, marginBottom: 2 }}>🛠 DEBUG INFO</div>
                {liveDebugInfo.tokenName && <div className="hud-truncate">{`Token: ${liveDebugInfo.tokenName}`}</div>}
                {liveDebugInfo.resumeHandle && <div className="hud-truncate">{`Resume: ${liveDebugInfo.resumeHandle}`}</div>}
                {liveDebugInfo.interactionId && <div className="hud-truncate">{`Interaction: ${liveDebugInfo.interactionId}`}</div>}
                {liveDebugInfo.interactionText && <div className="hud-truncate">{liveDebugInfo.interactionText}</div>}
                {bgmUrl && <div className="hud-truncate">{`BGM: ${bgmUrl}`}</div>}
              </div>
            )}
          </aside>

          {debugVisible && (
            <div className="hud-right-rail hud-animate" style={{ borderLeft: '2px solid #ff6b6b' }}>
              <div style={{ fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>🛠 DEBUG TOOLS</div>
              <button id="btn-fusion-drop" className="hud-btn hud-btn-amber" onClick={requestFusionDrop}>
                {t.dropFusion}
              </button>
              <button id="btn-live-token" className="hud-btn hud-btn-blue" onClick={requestLiveEphemeralToken}>
                {t.issueLiveToken}
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

          {debugVisible && (
            <button
              id="btn-p2p-media"
              className={`hud-btn hud-chip-btn ${isP2PMediaOn ? 'is-on' : 'is-off'}`}
              onClick={toggleP2PMedia}
            >
              {isP2PMediaOn ? t.p2pOn : t.p2pOff}
            </button>
          )}
        </>
      )}



      <Canvas
        className="arena-canvas"
        shadows={SHADOWS_ENABLED ? { type: THREE.PCFShadowMap } : false}
        camera={{ position: [0, 1.55, 3.2], fov: 48, near: 0.01, far: 100 }}
        onCreated={({ gl }) => {
          rendererRef.current = gl;
          installXrPresentationGuards(gl);
          gl.shadowMap.enabled = SHADOWS_ENABLED;
          gl.shadowMap.autoUpdate = SHADOWS_ENABLED;
        }}
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

      {appPhase === 'main' && (
        <>
          <ServerDrivenPanel />
          <DynamicSubtitle />
          <RemoteStreamView />
        </>
      )}
      
      {debugVisible && <AnimationDebugPanel />}
      
      {voiceAckText && (
        <div className="hud-voice-ack" aria-live="polite">
          {voiceAckText}
        </div>
      )}
      
      {(appPhase === 'summon' || appPhase === 'main') && isARSessionActive && (
        <ScanGuideOverlay scanState={scanState} pointCount={scanPointCount} />
      )}
      
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
