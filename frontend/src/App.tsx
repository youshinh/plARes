import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { OrbitControls } from '@react-three/drei';
import { ServerDrivenPanel } from './components/ui/ServerDrivenPanel';
import { AnimationDebugPanel } from './components/ui/AnimationDebugPanel';
import { DynamicSubtitle } from './components/ui/DynamicSubtitle';
import { RemoteStreamView } from './components/ui/RemoteStreamView';
import { ShareArenaModal } from './components/ui/ShareArenaModal';
import { ScanGuideOverlay } from './components/ui/ScanGuideOverlay';
import { AppEntryScreens } from './components/app/AppEntryScreens';
import { AppMainHud } from './components/app/AppMainHud';
import { MainScene } from './components/app/MainScene';
import { useAppArUi } from './hooks/useAppArUi';
import { useArenaRealtimeChannels } from './hooks/useArenaRealtimeChannels';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { useBgmAudio } from './hooks/useBgmAudio';
import { useCharacterSetup } from './hooks/useCharacterSetup';
import { useLiveSessionControls } from './hooks/useLiveSessionControls';
import { useRemoteBattleEvents } from './hooks/useRemoteBattleEvents';
import { rtcService } from './services/WebRTCDataChannelService';
import { wsService } from './services/WebSocketService';
import { useSpecialCasting } from './hooks/useSpecialCasting';
import { useVoiceAckFeedback } from './hooks/useVoiceAckFeedback';
import { useFSMStore, type PlayMode } from './store/useFSMStore';
import { useArenaSyncStore } from './store/useArenaSyncStore';
import { EX_GAUGE } from '../../shared/constants/battleConstants';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from './utils/identity';
import * as THREE from 'three';
import type {
  AppPhase,
  BattleUiState,
  DnaAbFeedbackPayload,
  ModeSession,
  ProfileInfo,
  RouteProgress,
} from './types/app';
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
const STORAGE_ROBOT_INITIALIZED_KEY = 'plares_robot_initialized';
const STORAGE_PLAY_MODE_KEY = 'plares_play_mode';
const STORAGE_ROUTE_PROGRESS_KEY = 'plares_route_progress';
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

const createModeSessionId = (prefix: 'training' | 'walk') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

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
    liveNeedConnection: 'LIVE接続を先に実行してください',
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
    modeHub: 'ハブ',
    modeMatch: '試合',
    modeTraining: '修行',
    modeWalk: '散歩',
    flowHubTitle: 'フローハブ',
    flowHubDesc: 'バトルへ急がず、育成と共創の流れに沿って次の行動を選びましょう。',
    flowPhase1Done: 'Phase 1 完了: 初回召喚済み',
    flowPhase2Title: 'Phase 2: 日常の共創',
    flowPhase2Desc: '散歩で環境認識を育てる / 修行で詠唱精度を高める',
    flowPhase3Title: 'Phase 3: 実戦',
    flowPhase3Desc: '位置合わせ後に対戦開始。即応はローカル、戦術はAIで上書き。',
    flowPhase4Title: 'Phase 4: 成長と進化',
    flowPhase4Desc: '記憶サマリーと戦歴の反映状況を確認',
    flowStartBattle: '対戦開始',
    flowReturnHub: 'ハブに戻る',
    flowOpenMemory: '記憶を確認',
    battleOnlyHint: 'この操作は対戦モードで有効です',
    routeGuideTitle: '初回おすすめルート',
    routeGuideDesc: '散歩 → 修行 → 対戦 の順で進むと、機体の理解とシンクロが安定します。',
    routeStepWalk: '散歩を1回完了',
    routeStepTraining: '修行を1回完了',
    routeStepBattle: '対戦を1回開始',
    routeStatusTodo: '未着手',
    routeStatusDoing: '進行中',
    routeStatusDone: '完了',
    routeCtaNext: '次の推奨アクション',
    routeCtaComplete: '推奨ルート達成',
    prepTitle: '対戦準備ブリーフィング',
    prepDesc: '対戦開始前に、ルート進捗と機体設定を確認しましょう。',
    prepStepRoute: '推奨ルート進捗',
    prepStepModel: '機体モデル',
    prepStepAlign: '開幕アクション',
    prepReady: '準備OK',
    prepGuide: '確認',
    prepMissing: '未達',
    prepAlignGuide: '開始後に位置合わせ',
    prepStartNow: 'この内容で対戦開始',
    prepBackHub: 'ハブに戻る',
    prepGoWalk: '散歩を先に実施',
    prepGoTraining: '修行を先に実施',
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
    liveNeedConnection: 'Connect Live first.',
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
    modeHub: 'Hub',
    modeMatch: 'Match',
    modeTraining: 'Training',
    modeWalk: 'Walk',
    flowHubTitle: 'Flow Hub',
    flowHubDesc: 'Choose the next step in the intended loop instead of jumping straight into battle.',
    flowPhase1Done: 'Phase 1 complete: first summon finished',
    flowPhase2Title: 'Phase 2: Daily Co-creation',
    flowPhase2Desc: 'Use Walk for environment bonding or Training for incantation accuracy.',
    flowPhase3Title: 'Phase 3: Battle',
    flowPhase3Desc: 'Start a match after alignment. Local reflexes + AI tactical overrides.',
    flowPhase4Title: 'Phase 4: Growth & Evolution',
    flowPhase4Desc: 'Review memory summary and progression feedback.',
    flowStartBattle: 'Start Battle',
    flowReturnHub: 'Back to Hub',
    flowOpenMemory: 'Open Memory',
    battleOnlyHint: 'This action is available only in match mode.',
    routeGuideTitle: 'Recommended First Route',
    routeGuideDesc: 'Follow Walk → Training → Battle once to build stable sync and context.',
    routeStepWalk: 'Complete Walk once',
    routeStepTraining: 'Complete Training once',
    routeStepBattle: 'Start Battle once',
    routeStatusTodo: 'Todo',
    routeStatusDoing: 'In Progress',
    routeStatusDone: 'Done',
    routeCtaNext: 'Recommended Next Action',
    routeCtaComplete: 'Route Completed',
    prepTitle: 'Battle Prep Briefing',
    prepDesc: 'Review route progress and machine setup before entering battle.',
    prepStepRoute: 'Recommended Route',
    prepStepModel: 'Machine Model',
    prepStepAlign: 'Opening Action',
    prepReady: 'Ready',
    prepGuide: 'Check',
    prepMissing: 'Missing',
    prepAlignGuide: 'Align arena after match starts',
    prepStartNow: 'Start Battle With This Setup',
    prepBackHub: 'Back to Hub',
    prepGoWalk: 'Do Walk First',
    prepGoTraining: 'Do Training First',
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
    liveNeedConnection: 'Conecta Live primero.',
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
    modeHub: 'Hub',
    modeMatch: 'Partida',
    modeTraining: 'Entreno',
    modeWalk: 'Paseo',
    flowHubTitle: 'Hub de Flujo',
    flowHubDesc: 'Elige el siguiente paso del bucle de juego en lugar de entrar directo al combate.',
    flowPhase1Done: 'Fase 1 completa: primera invocacion finalizada',
    flowPhase2Title: 'Fase 2: Co-creacion diaria',
    flowPhase2Desc: 'Paseo para contexto ambiental o Entreno para mejorar la invocacion.',
    flowPhase3Title: 'Fase 3: Batalla',
    flowPhase3Desc: 'Inicia combate despues de alinear arena. Reflejos locales + tactica AI.',
    flowPhase4Title: 'Fase 4: Crecimiento y evolucion',
    flowPhase4Desc: 'Revisa memoria y progreso acumulado.',
    flowStartBattle: 'Iniciar Batalla',
    flowReturnHub: 'Volver al Hub',
    flowOpenMemory: 'Ver Memoria',
    battleOnlyHint: 'Esta accion solo esta disponible en modo batalla.',
    routeGuideTitle: 'Ruta inicial recomendada',
    routeGuideDesc: 'Sigue Paseo → Entreno → Batalla una vez para mejorar sincronia y contexto.',
    routeStepWalk: 'Completar Paseo una vez',
    routeStepTraining: 'Completar Entreno una vez',
    routeStepBattle: 'Iniciar Batalla una vez',
    routeStatusTodo: 'Pendiente',
    routeStatusDoing: 'En curso',
    routeStatusDone: 'Completado',
    routeCtaNext: 'Siguiente accion recomendada',
    routeCtaComplete: 'Ruta completada',
    prepTitle: 'Briefing previo a batalla',
    prepDesc: 'Revisa progreso de ruta y configuracion del robot antes de combatir.',
    prepStepRoute: 'Ruta recomendada',
    prepStepModel: 'Modelo de robot',
    prepStepAlign: 'Accion inicial',
    prepReady: 'Listo',
    prepGuide: 'Revisar',
    prepMissing: 'Pendiente',
    prepAlignGuide: 'Alinear arena al iniciar batalla',
    prepStartNow: 'Iniciar batalla con esta preparacion',
    prepBackHub: 'Volver al Hub',
    prepGoWalk: 'Hacer Paseo primero',
    prepGoTraining: 'Hacer Entreno primero',
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
  const currentModelType = useFSMStore(s => s.modelType);
  const setRobotDna = useFSMStore(s => s.setRobotDna);
  const setRemoteRobotPosition = useFSMStore(s => s.setRemoteRobotPosition);
  const matchAlignmentReady = useArenaSyncStore(s => s.matchAlignmentReady);
  const hasRemotePeer = useArenaSyncStore(s => s.hasRemotePeer);
  const isSolo = !hasRemotePeer;
  const localHp = useFSMStore(s => s.localHp);
  const enemyHp = useFSMStore(s => s.enemyHp);

  const [isP2PMediaOn, setIsP2PMediaOn] = useState(false);
  const [specialPhrase, setSpecialPhrase] = useState('');
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [isMatchPaused, setIsMatchPaused] = useState(false);
  const playMode = useFSMStore(s => s.playMode);
  const setPlayMode = useFSMStore(s => s.setPlayMode);
  const switchMode = (mode: PlayMode) => {
    setPlayMode(mode);
  };
  const returnToHub = () => {
    setIsBattlePrepOpen(false);
    switchMode('hub');
  };
  const enterBattleMode = () => {
    setIsBattlePrepOpen(false);
    setTrainingSession(null);
    setWalkSession(null);
    setLocalRouteProgress(prev => ({ ...prev, battle: prev.battle + 1 }));
    switchMode('match');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.flowStartBattle },
    }));
  };
  const [trainingSession, setTrainingSession] = useState<ModeSession | null>(null);
  const [walkSession, setWalkSession] = useState<ModeSession | null>(null);
  const [localRouteProgress, setLocalRouteProgress] = useState<RouteProgress>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ROUTE_PROGRESS_KEY);
      if (!raw) return { walk: 0, training: 0, battle: 0 };
      const parsed = JSON.parse(raw) as Partial<{ walk: number; training: number; battle: number }>;
      return {
        walk: Math.max(0, Number(parsed.walk ?? 0)),
        training: Math.max(0, Number(parsed.training ?? 0)),
        battle: Math.max(0, Number(parsed.battle ?? 0)),
      };
    } catch {
      return { walk: 0, training: 0, battle: 0 };
    }
  });
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLabOpen, setIsLabOpen] = useState(false);
  const [isBattlePrepOpen, setIsBattlePrepOpen] = useState(false);
  const [recentABFeedbackCount, setRecentABFeedbackCount] = useState(0);
  const [bgmUrl, setBgmUrl] = useState('');
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (overlayRef.current) {
      store.setState({ domOverlayRoot: overlayRef.current });
    }
  }, []);

  // Debug panel toggle (visible to all, toggled by header button)
  const [debugVisible, setDebugVisible] = useState(DEBUG_UI);
  // Phase Management: 0=Lang, 1=Scan(Setup), 2=Summon(AR Init), 3=Main
  const [appPhase, setAppPhase] = useState<AppPhase>(() => {
    try {
      if (!localStorage.getItem(STORAGE_LANG_SELECTED_KEY)) return 'lang';
      const setupDone =
        import.meta.env.VITE_SKIP_FACE_SCANNER === 'true' ||
        localStorage.getItem(STORAGE_ROBOT_INITIALIZED_KEY) === 'done';
      return setupDone ? 'summon' : 'scan';
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
  const [battleState, setBattleState] = useState<BattleUiState>({
    hp: 100,
    maxHp: 100,
    opponentHp: 100,
    opponentMaxHp: 100,
    exGauge: 0,
    specialReady: false,
    heatActive: false,
  });
  const battleStateRef = useRef<BattleUiState>(battleState);
  useEffect(() => {
    battleStateRef.current = battleState;
  }, [battleState]);
  const [showFusionCraft, setShowFusionCraft] = useState(false);
  const {
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
  } = useLiveSessionControls({
    liveNeedConnectionText: t.liveNeedConnection,
  });
  const voiceAckText = useVoiceAckFeedback(t);
  const {
    arSupportState,
    handleEnterAr,
    isARSessionActive,
    scanPointCount,
    scanState,
  } = useAppArUi({
    preferJapanese: uiLang === 'ja',
    rendererRef,
    shadowsEnabled: SHADOWS_ENABLED,
    unsupportedHintText: t.arUnsupportedHint,
    xrStore: store,
  });
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
  const walkProgress = Math.max(profileView.totalWalkSessions, localRouteProgress.walk);
  const trainingProgress = Math.max(profileView.totalTrainingSessions, localRouteProgress.training);
  const battleProgress = Math.max(profileView.totalMatches, localRouteProgress.battle);
  const hasWalkMilestone = walkProgress > 0;
  const hasTrainingMilestone = trainingProgress > 0;
  const hasBattleMilestone = battleProgress > 0;
  const hasRouteFoundation = hasWalkMilestone && hasTrainingMilestone;
  const routeNextStep: 'walk' | 'training' | 'match' | 'complete' =
    !hasWalkMilestone ? 'walk' :
    !hasTrainingMilestone ? 'training' :
    !hasBattleMilestone ? 'match' :
    'complete';
  const routeStatus = (step: 'walk' | 'training' | 'match'): 'todo' | 'doing' | 'done' => {
    if (step === 'walk') {
      if (walkSession) return 'doing';
      return hasWalkMilestone ? 'done' : 'todo';
    }
    if (step === 'training') {
      if (trainingSession) return 'doing';
      return hasTrainingMilestone ? 'done' : 'todo';
    }
    if (playMode === 'match') return 'doing';
    return hasBattleMilestone ? 'done' : 'todo';
  };
  const routeSteps = ([
    ['walk', t.routeStepWalk],
    ['training', t.routeStepTraining],
    ['match', t.routeStepBattle],
  ] as const).map(([step, label]) => ({
    key: step,
    label,
    status: routeStatus(step),
  }));
  const openBattlePrep = () => {
    if (playMode === 'match') return;
    setIsBattlePrepOpen(true);
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.prepTitle },
    }));
  };
  const openProfile = () => {
    setIsProfileOpen(true);
  };
  const proceedToMain = () => {
    switchMode('hub');
    setAppPhase('main');
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
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ROUTE_PROGRESS_KEY, JSON.stringify(localRouteProgress));
    } catch {
      // noop
    }
  }, [localRouteProgress]);
  useEffect(() => {
    if (playMode !== 'match') {
      setRemoteRobotPosition(null);
    }
  }, [playMode, setRemoteRobotPosition]);

  const modeLabel =
    playMode === 'hub' ? t.modeHub :
    playMode === 'training' ? t.modeTraining :
    playMode === 'walk' ? t.modeWalk :
    t.modeMatch;

  const startTraining = () => {
    setIsBattlePrepOpen(false);
    setWalkSession(null);
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
    setLocalRouteProgress(prev => ({ ...prev, training: prev.training + 1 }));
    setTrainingSession(null);
    switchMode('hub');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.completeTraining },
    }));
  };

  const startWalk = () => {
    setIsBattlePrepOpen(false);
    setTrainingSession(null);
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
    setLocalRouteProgress(prev => ({ ...prev, walk: prev.walk + 1 }));
    setWalkSession(null);
    switchMode('hub');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.completeWalk },
    }));
  };
  const triggerRecommendedRouteStep = () => {
    if (routeNextStep === 'walk') {
      startWalk();
      return;
    }
    if (routeNextStep === 'training') {
      startTraining();
      return;
    }
    if (routeNextStep === 'match') {
      openBattlePrep();
      return;
    }
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.routeCtaComplete },
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
  const submitDnaABFeedback = (payload: DnaAbFeedbackPayload) => {
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
  useRemoteBattleEvents({
    battleStateRef,
    pendingLiveConnectRef,
    robotDna,
    robotMaterial,
    setBattleState,
    setRecentABFeedbackCount,
    setProfileInfo,
    setSpecialPhrase,
    setBgmUrl,
    setIsMatchPaused,
    setLiveDebugInfo,
    setRobotDna,
    setRobotStats,
    saveTranslations: saveCachedTranslations,
    t,
  });
  useArenaRealtimeChannels({ appPhase, wsUrl: WS_URL });

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
  useBgmAudio(bgmUrl);
  const { handleCastSpecial } = useSpecialCasting({
    battleStateRef,
    isMatchPaused,
    matchAlignmentReady,
    playMode,
    resolveSpecialResult,
    setBattleState,
    setCastingSpecial,
    specialPhrase,
    startStream,
    stopStream,
    t,
  });

  const isArButtonDisabled = arSupportState !== 'supported';
  const arButtonLabel =
    arSupportState === 'checking'
      ? t.arChecking
      : (isArButtonDisabled ? t.arUnavailable : t.enterAr);
  const arButtonTitle =
    arSupportState === 'checking'
      ? 'Checking AR support...'
      : (isArButtonDisabled ? t.arUnsupportedHint : t.enterAr);
  const isMainPhase = appPhase === 'main';
  const isHubMode = playMode === 'hub';
  const showBattleHud = isMainPhase && playMode === 'match';
  const liveActionDisabled = !isLiveConnected;

  return (
    <div className="arena-shell" ref={overlayRef}>
      <div className="arena-atmosphere" aria-hidden />
      <AppEntryScreens
        appPhase={appPhase}
        t={t}
        langOptions={LANG_OPTIONS}
        selectedLanguage={selectedLanguage}
        onApplyLanguage={(langCode) => applyLanguage(langCode, true)}
        onGenerateCharacter={generateCharacter}
        isGenerating={isGenerating}
        arSupportState={arSupportState}
        onEnterAr={() => {
          void handleEnterAr();
        }}
        onProceedToMain={proceedToMain}
      />
      {isMainPhase && (
        <AppMainHud
          t={t}
          characterLabEnabled={CHARACTER_LAB_UI}
          currentModelType={currentModelType}
          playMode={playMode}
          isHubMode={isHubMode}
          showBattleHud={showBattleHud}
          debugVisible={debugVisible}
          isArButtonDisabled={isArButtonDisabled}
          arButtonLabel={arButtonLabel}
          arButtonTitle={arButtonTitle}
          isProfileOpen={isProfileOpen}
          isShareOpen={isShareOpen}
          isLabOpen={isLabOpen}
          isBattlePrepOpen={isBattlePrepOpen}
          showFusionCraft={showFusionCraft}
          isP2PMediaOn={isP2PMediaOn}
          isLiveConnected={isLiveConnected}
          isLiveMicActive={isLiveMicActive}
          liveActionDisabled={liveActionDisabled}
          isMatchPaused={isMatchPaused}
          isStreaming={isStreaming}
          isSolo={isSolo}
          alignmentReady={alignmentReady}
          matchAlignmentReady={matchAlignmentReady}
          hasWalkMilestone={hasWalkMilestone}
          hasTrainingMilestone={hasTrainingMilestone}
          hasRouteFoundation={hasRouteFoundation}
          recentABFeedbackCount={recentABFeedbackCount}
          selectedLanguage={selectedLanguage}
          modeLabel={modeLabel}
          scanState={scanState}
          scanPointCount={scanPointCount}
          isARSessionActive={isARSessionActive}
          walkSession={walkSession}
          trainingSession={trainingSession}
          specialPhrase={specialPhrase}
          battleState={battleState}
          profileInfo={profileInfo}
          profileView={profileView}
          liveDebugInfo={liveDebugInfo}
          bgmUrl={bgmUrl}
          robotDna={robotDna}
          robotMaterial={robotMaterial}
          localHp={localHp}
          enemyHp={enemyHp}
          routeNextStep={routeNextStep}
          routeSteps={routeSteps}
          onEnterAr={() => {
            void handleEnterAr();
          }}
          onRequestMatchEnd={requestMatchEnd}
          onPublishArenaCalibration={publishArenaCalibration}
          onToggleProfile={() => setIsProfileOpen((open) => !open)}
          onOpenProfile={openProfile}
          onOpenShare={() => setIsShareOpen(true)}
          onOpenLab={() => setIsLabOpen(true)}
          onCloseLab={() => setIsLabOpen(false)}
          onToggleDebug={() => setDebugVisible((visible) => !visible)}
          onStartWalk={startWalk}
          onStartTraining={startTraining}
          onCompleteWalk={completeWalk}
          onCompleteTraining={completeTraining}
          onOpenBattlePrep={openBattlePrep}
          onCloseBattlePrep={() => setIsBattlePrepOpen(false)}
          onEnterBattleMode={enterBattleMode}
          onOpenFusionCraft={() => setShowFusionCraft(true)}
          onCloseFusionCraft={() => setShowFusionCraft(false)}
          onRequestProfileSync={requestProfileSync}
          onToggleLiveConnection={isLiveConnected ? disconnectLiveDirect : connectLiveDirect}
          onToggleLiveMic={toggleLiveMic}
          onSendLiveTextPing={sendLiveTextPing}
          onReturnToHub={returnToHub}
          onWalkVisionOrProfileSync={playMode === 'walk' ? sendWalkVisionTrigger : requestProfileSync}
          onSendWalkVisionTrigger={sendWalkVisionTrigger}
          onRequestFusionDrop={requestFusionDrop}
          onRequestLiveEphemeralToken={requestLiveEphemeralToken}
          onRequestInteractionTurn={requestInteractionTurn}
          onHandleCastSpecial={() => {
            void handleCastSpecial();
          }}
          onToggleP2PMedia={() => {
            void toggleP2PMedia();
          }}
          onTriggerRecommendedRouteStep={triggerRecommendedRouteStep}
          onChangeLanguage={(nextLanguage) => {
            setSelectedLanguage(nextLanguage);
            applyLanguage(nextLanguage, true);
          }}
          onSubmitDnaFeedback={(payload) => {
            submitDnaABFeedback(payload);
            setIsLabOpen(false);
          }}
        />
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
          {appPhase === 'main' && (
            <>
              <MainScene shadowsEnabled={SHADOWS_ENABLED} />
              <OrbitControls
                makeDefault
                enablePan={false}
                enableDamping={false}
                autoRotate={false}
              />
            </>
          )}
        </XR>
      </Canvas>

      {appPhase === 'main' && (
        <>
          {showBattleHud && <ServerDrivenPanel />}
          <DynamicSubtitle />
          {showBattleHud && <RemoteStreamView />}
        </>
      )}
      
      {debugVisible && showBattleHud && <AnimationDebugPanel />}
      
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
