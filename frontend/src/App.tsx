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
import { AppOverlayRouter } from './components/app/AppOverlayRouter';
import { MainScene } from './components/app/MainScene';
import { useAppArUi } from './hooks/useAppArUi';
import { useArenaRealtimeChannels } from './hooks/useArenaRealtimeChannels';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { useBgmAudio } from './hooks/useBgmAudio';
import { useCharacterSetup } from './hooks/useCharacterSetup';
import { useLiveSessionControls } from './hooks/useLiveSessionControls';
import { resolveConfiguredLivePolicyPhase, useLiveRouteSelector } from './hooks/useLiveRouteSelector';
import { useEntryScreenProps, useMainHudProps } from './hooks/useAppOverlayProps';
import { useRemoteBattleEvents } from './hooks/useRemoteBattleEvents';
import { rtcService } from './services/WebRTCDataChannelService';
import { wsService } from './services/WebSocketService';
import { useSpecialCasting } from './hooks/useSpecialCasting';
import { useVoiceAckFeedback } from './hooks/useVoiceAckFeedback';
import { useFSMStore, type PlayMode } from './store/useFSMStore';
import { useArenaSyncStore } from './store/useArenaSyncStore';
import {
  canonicalizeLocale,
  loadCachedTranslations,
  localeUsesBuiltinDictionary,
  mergeLanguagePresets,
  rememberRecentLocale,
  resolveBaseUiLang,
  saveCachedTranslations,
  type UiLang,
} from './i18n/runtime';
import { EX_GAUGE } from '../../shared/constants/battleConstants';
import { PLAYER_ID, PLAYER_LANG, ROOM_ID, SYNC_RATE } from './utils/identity';
import * as THREE from 'three';
import type {
  AppPhase,
  BattleUiState,
  DnaAbFeedbackPayload,
  FusionCraftFlowState,
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
const STORAGE_PENDING_TRANSLATION_KEY = 'plares_pending_translation_locale';
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
    scanTitle: '⚙️ プラレスラー生成',
    scanCameraDesc: 'インカメラで顔を撮影すると、あなただけのAIロボットが生まれます！',
    scanSkipDesc: 'テキストでロボットの性格を入力してください。',
    scanCapture: '📸 撮影する',
    scanRetake: '🔄 撮り直す',
    scanSkip: 'スキップ →',
    scanSummon: '🤖 ロボット召喚！',
    scanGenerating: '⏳ 生成中…',
    scanAnalyzing: 'Gemini が機体を解析中…',
    scanCameraDenied: 'カメラへのアクセスが許可されませんでした。スキップしてください。',
    scanTextareaPlaceholder: '例: 無口で忍耐強い重戦車型ロボット',
    scanFallbackPrompt: 'バランスの取れた万能ロボット',
    scanPresetSpeedLabel: '⚡ スピード重視の忍者型',
    scanPresetSpeedPrompt: '俊敏でスピード重視、シャープな目つきのニンジャロボット',
    scanPresetPowerLabel: '💪 パワー重視のマッチョ型',
    scanPresetPowerPrompt: '力強くタフな体格、しっかりした顎のマッチョロボット',
    scanPresetCharmLabel: '🎤 愛嬌重視のアイドル型',
    scanPresetCharmPrompt: '表情豊かで笑顔が素敵、観客を魅了するアイドルロボット',
    summonTitle: 'Phase 1.3: 初召喚',
    summonDesc: '現実の床や机を映して、AIパートナーを召喚する位置を整えます。',
    summonProceedNoAr: 'メインメニューへ進む (AR非対応)',
    summonSkipAr: 'AR召喚をスキップ',
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
    arStatusOff: '通常表示',
    arStatusReady: '床を認識済み',
    arStatusTracking: '位置追跡中',
    arStatusSearching: '床を探索中',
    heatOn: '発動中',
    heatOff: '通常',
    toneBalanced: 'バランス型',
    toneAggressive: '熱血型',
    toneCool: '冷静型',
    toneFun: 'ムードメーカー',
    toneFocused: '集中型',
    toneDistrustful: '警戒型',
    matchResultWin: '勝利',
    matchResultLose: '敗北',
    matchResultDraw: '引き分け',
    matchUnit: '戦',
    sessionUnit: '回',
    hp: 'HP',
    enemyHp: '敵HP',
    heat: 'ヒート',
    noMemory: 'メモリはまだありません',
    memoryUnreadable: '記憶を整理中です。最新の行動ログを反映しています。',
    memoryWalkLabel: '散歩',
    memoryTrainingLabel: '修行',
    memoryMatchLabel: '対戦',
    memoryInsightLabel: '気づき',
    memoryToneShiftLabel: '口調変化',
    memoryAccuracyLabel: '精度',
    memorySpeedLabel: '速度',
    memoryPassionLabel: '気迫',
    memoryItemsLabel: '発見',
    memoryReflectionLabel: '反応',
    memoryCriticalLabel: 'クリティカル',
    memoryMissLabel: 'ミス',
    memoryHighlightsLabel: 'ハイライト',
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
    flowOpenSettings: '設定を開く',
    battleOnlyHint: 'この操作は対戦モードで有効です',
    settingsTitle: '設定',
    settingsDesc: '言語変更やメニュー系の操作はここから行います。',
    quickActions: 'クイック操作',
    closeMenu: '閉じる',
    liveRoutingTitle: 'Live経路',
    liveConversationRoute: '会話',
    liveBattleRoute: '戦術助言',
    liveCommentaryRoute: '実況',
    liveVisionRoute: '視覚トリガー',
    liveAdkStatus: 'ADK Live',
    liveStatusLabel: '状態',
    liveDegradedReason: '理由',
    liveAvailable: '利用可能',
    liveUnavailable: '利用不可',
    livePending: '確認中',
    currentLanguage: '現在の言語',
    languageSettingHint: 'あとで言語を変えたい時は、ここからいつでも切り替えられます。',
    languageChangeAfterMatch: '対戦中は言語を変更できません。ハブに戻ってから変更してください。',
    debugSection: 'Live / Debug',
    debugBattleState: '戦況スナップショット',
    debugAdkTactic: 'ADK戦術提案',
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
    routeGuideDoneDesc: '初回おすすめルートは達成済みです。必要な時だけ詳細を開けます。',
    routeOpenCompleted: '達成内容を開く',
    routeHideCompleted: '閉じる',
    prepTitle: '対戦準備ブリーフィング',
    prepDesc: '対戦開始前に、ルート進捗と機体設定を確認しましょう。',
    prepStepRoute: '推奨ルート進捗',
    prepStepModel: '機体モデル',
    prepStepPalette: '機体カラー',
    prepOwnMachine: '自機',
    prepEnemyMachine: '敵機',
    prepEnemyFrame: '敵機タイプ',
    prepEnemyPalette: '敵機カラー',
    prepStepAlign: '開幕アクション',
    prepReady: '準備OK',
    prepGuide: '確認',
    prepMissing: '未達',
    prepAlignGuide: '開始後に位置合わせ',
    prepSelectFrame: '機体リスト',
    prepMaterialWood: '木材',
    prepMaterialResin: '樹脂',
    prepMaterialMetal: '金属',
    prepBodyHeavy: 'ヘビー',
    prepBodySlim: 'スリム',
    prepBodyHeavyDesc: '重装甲でパワー寄り',
    prepBodySlimDesc: '軽快でヒーロー寄り',
    prepPaletteMarine: 'マリン',
    prepPaletteEmber: 'エンバー',
    prepPaletteForest: 'フォレスト',
    prepPaletteRoyal: 'ロイヤル',
    prepPaletteObsidian: 'オブシディアン',
    prepPaletteSunset: 'サンセット',
    prepStartNow: 'この内容で対戦開始',
    prepBackHub: 'ハブに戻る',
    prepGoWalk: '散歩を先に実施',
    prepGoTraining: '修行を先に実施',
    twistTitle: '早口チャレンジ:',
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
    applyLanguage: '適用',
    exGaugeLabel: 'EX',
    fusionLaunch: 'Fusion Craft',
    walkFocusTitle: '現実を観察して素材を集める',
    walkFocusDesc: '散歩中は探索と会話が主役です。クラフトか観察トリガーを使い、終わったら散歩を完了します。',
    trainingFocusTitle: '詠唱と反射を整える',
    trainingFocusDesc: '修行では詠唱精度を上げます。EX が溜まったら必殺詠唱を試し、終わったら修行を完了します。',
    matchFocusTitle: '対戦中の主行動',
    matchFocusDesc: '対戦では位置合わせと必殺のタイミングだけに集中します。育成系の操作はここでは出しません。',
    fusionTitle: 'Real-World Fusion Craft',
    fusionHint: '現実の物体を撮影し、機体へ取り込むコンセプトを指定します。',
    fusionCapturePrompt: '撮影またはアップロード',
    fusionConceptLabel: '融合コンセプト',
    fusionConceptPlaceholder: '例: レーザー聖剣 / 木目シールド / 漆黒装甲',
    fusionBegin: 'BEGIN FUSION',
    fusionGenerating: '融合中… テクスチャを生成しています',
    fusionWaiting: '生成結果を待っています…',
    fusionSuccess: '融合完了',
    fusionSuccessBody: '新しい素材を機体へ取り込みました。散歩を続けるか、完了して次へ進めます。',
    fusionRetry: '再試行',
    fusionRetake: '撮り直す',
    fusionClose: '散歩に戻る',
    fusionValidation: '画像とコンセプトの両方が必要です',
    fusionError: 'Fusion Craft に失敗しました',
    scanEquipmentModeLabel: 'スキャン用途',
    scanEquipmentModeSkin: 'スキン化',
    scanEquipmentModeAttachment: '装備化',
    scanEquipmentMountLabel: '装備スロット',
    scanEquipmentPromptLabel: '装備コンセプト',
    scanEquipmentPromptPlaceholder: '例: 春巻きソード / 額バイザー / バックパック',
    scanEquipmentGenerating: '装備化中… 取り付け素材を生成しています',
  },
  en: {
    brandSub: 'Next-Gen AI Agent Arena',
    language: 'Language',
    chooseLanguage: 'Choose your language',
    chooseLanguageDesc: 'Pick your default UI language. You can change this later.',
    scanTitle: '⚙️ Create Your Plareser',
    scanCameraDesc: 'Capture your face with the front camera to generate a one-of-a-kind AI robot.',
    scanSkipDesc: 'Describe the robot personality you want in text.',
    scanCapture: '📸 Capture',
    scanRetake: '🔄 Retake',
    scanSkip: 'Skip →',
    scanSummon: '🤖 Summon Robot!',
    scanGenerating: '⏳ Generating…',
    scanAnalyzing: 'Gemini is analyzing your machine…',
    scanCameraDenied: 'Camera access was not granted. Use the skip route instead.',
    scanTextareaPlaceholder: 'e.g. A silent heavy robot with patience and strong armor',
    scanFallbackPrompt: 'A balanced all-round robot',
    scanPresetSpeedLabel: '⚡ Speed Ninja',
    scanPresetSpeedPrompt: 'A sharp-eyed ninja robot built for speed and agility',
    scanPresetPowerLabel: '💪 Power Brawler',
    scanPresetPowerPrompt: 'A sturdy, muscular robot with overwhelming power and toughness',
    scanPresetCharmLabel: '🎤 Idol Charmer',
    scanPresetCharmPrompt: 'A cheerful idol robot with expressive emotions and crowd appeal',
    summonTitle: 'Phase 1.3: First Summoning',
    summonDesc: 'Scan a real floor or table surface to position and summon your AI partner.',
    summonProceedNoAr: 'Proceed to Main Menu (AR Not Supported)',
    summonSkipAr: 'Skip AR Summoning',
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
    arStatusOff: 'Standard View',
    arStatusReady: 'Surface Ready',
    arStatusTracking: 'Tracking',
    arStatusSearching: 'Scanning Surface',
    heatOn: 'Active',
    heatOff: 'Normal',
    toneBalanced: 'Balanced',
    toneAggressive: 'Aggressive',
    toneCool: 'Cool',
    toneFun: 'Playful',
    toneFocused: 'Focused',
    toneDistrustful: 'Distrustful',
    matchResultWin: 'Win',
    matchResultLose: 'Lose',
    matchResultDraw: 'Draw',
    matchUnit: 'matches',
    sessionUnit: 'sessions',
    hp: 'HP',
    enemyHp: 'Enemy HP',
    heat: 'Heat',
    noMemory: 'No memory summary yet',
    memoryUnreadable: 'Memory is being organized. Showing recent readable events only.',
    memoryWalkLabel: 'Walk',
    memoryTrainingLabel: 'Training',
    memoryMatchLabel: 'Match',
    memoryInsightLabel: 'Insight',
    memoryToneShiftLabel: 'Tone Shift',
    memoryAccuracyLabel: 'Accuracy',
    memorySpeedLabel: 'Speed',
    memoryPassionLabel: 'Passion',
    memoryItemsLabel: 'Finds',
    memoryReflectionLabel: 'Reflections',
    memoryCriticalLabel: 'Critical',
    memoryMissLabel: 'Miss',
    memoryHighlightsLabel: 'Highlights',
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
    flowOpenSettings: 'Open Settings',
    battleOnlyHint: 'This action is available only in match mode.',
    settingsTitle: 'Settings',
    settingsDesc: 'Use this area for language changes and secondary menu controls.',
    quickActions: 'Quick Actions',
    closeMenu: 'Close',
    liveRoutingTitle: 'Live Routing',
    liveConversationRoute: 'Conversation',
    liveBattleRoute: 'Battle Coach',
    liveCommentaryRoute: 'Commentary',
    liveVisionRoute: 'Vision Trigger',
    liveAdkStatus: 'ADK Live',
    liveStatusLabel: 'Status',
    liveDegradedReason: 'Reason',
    liveAvailable: 'Available',
    liveUnavailable: 'Unavailable',
    livePending: 'Checking',
    currentLanguage: 'Current Language',
    languageSettingHint: 'You can come back here later whenever you want to change the UI language.',
    languageChangeAfterMatch: 'Language changes are locked during a match. Return to the hub first.',
    debugSection: 'Live / Debug',
    debugBattleState: 'Battle Snapshot',
    debugAdkTactic: 'ADK Tactic',
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
    routeGuideDoneDesc: 'The recommended first route is complete. Open the details only when you need them.',
    routeOpenCompleted: 'Open completed route',
    routeHideCompleted: 'Hide details',
    prepTitle: 'Battle Prep Briefing',
    prepDesc: 'Review route progress and machine setup before entering battle.',
    prepStepRoute: 'Recommended Route',
    prepStepModel: 'Machine Model',
    prepStepPalette: 'Color Scheme',
    prepOwnMachine: 'Your Machine',
    prepEnemyMachine: 'Enemy Machine',
    prepEnemyFrame: 'Enemy Frame',
    prepEnemyPalette: 'Enemy Color',
    prepStepAlign: 'Opening Action',
    prepReady: 'Ready',
    prepGuide: 'Check',
    prepMissing: 'Missing',
    prepAlignGuide: 'Align arena after match starts',
    prepSelectFrame: 'Machine List',
    prepMaterialWood: 'Wood',
    prepMaterialResin: 'Resin',
    prepMaterialMetal: 'Metal',
    prepBodyHeavy: 'Heavy',
    prepBodySlim: 'Slim',
    prepBodyHeavyDesc: 'Power-focused heavy frame',
    prepBodySlimDesc: 'Mobile heroic frame',
    prepPaletteMarine: 'Marine',
    prepPaletteEmber: 'Ember',
    prepPaletteForest: 'Forest',
    prepPaletteRoyal: 'Royal',
    prepPaletteObsidian: 'Obsidian',
    prepPaletteSunset: 'Sunset',
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
    applyLanguage: 'Apply',
    exGaugeLabel: 'EX',
    fusionLaunch: 'Fusion Craft',
    walkFocusTitle: 'Scan the room and gather material ideas',
    walkFocusDesc: 'Walk mode is for exploration and ambient dialogue. Trigger craft or observation, then wrap the walk when you are done.',
    trainingFocusTitle: 'Sharpen incantation and reflexes',
    trainingFocusDesc: 'Training is for sync and articulation. Build EX, test the incantation, then finish the session.',
    matchFocusTitle: 'Match control focus',
    matchFocusDesc: 'In battle, focus on alignment, dodges, and special timing. Growth actions should stay out of this screen.',
    fusionTitle: 'Real-World Fusion Craft',
    fusionHint: 'Capture a real object, then define the concept you want your robot to absorb.',
    fusionCapturePrompt: 'Capture or Upload',
    fusionConceptLabel: 'Fusion Concept',
    fusionConceptPlaceholder: 'e.g. Laser holy sword / Timber shield / Carbon armor',
    fusionBegin: 'Begin Fusion',
    fusionGenerating: 'Fusing essence and generating texture…',
    fusionWaiting: 'Waiting for the generated result…',
    fusionSuccess: 'Fusion complete',
    fusionSuccessBody: 'The new material has been synced to your machine. Continue the walk or finish it and move on.',
    fusionRetry: 'Retry',
    fusionRetake: 'Retake',
    fusionClose: 'Back to Walk',
    fusionValidation: 'Both an image and a concept are required.',
    fusionError: 'Fusion Craft failed',
    scanEquipmentModeLabel: 'Scan Output',
    scanEquipmentModeSkin: 'Skin',
    scanEquipmentModeAttachment: 'Attachment',
    scanEquipmentMountLabel: 'Mount Slot',
    scanEquipmentPromptLabel: 'Attachment Concept',
    scanEquipmentPromptPlaceholder: 'e.g. Spring-roll sword / Visor crest / Jet backpack',
    scanEquipmentGenerating: 'Generating attachment material…',
  },
  es: {
    brandSub: 'Arena de Agentes IA',
    language: 'Idioma',
    chooseLanguage: 'Elige tu idioma',
    chooseLanguageDesc: 'Selecciona el idioma inicial de la interfaz. Puedes cambiarlo despues.',
    scanTitle: '⚙️ Crear tu Plareser',
    scanCameraDesc: 'Captura tu rostro con la camara frontal para generar un robot AI unico.',
    scanSkipDesc: 'Describe en texto la personalidad del robot que quieres.',
    scanCapture: '📸 Capturar',
    scanRetake: '🔄 Repetir',
    scanSkip: 'Saltar →',
    scanSummon: '🤖 Invocar Robot',
    scanGenerating: '⏳ Generando…',
    scanAnalyzing: 'Gemini esta analizando tu maquina…',
    scanCameraDenied: 'No se concedio acceso a la camara. Usa la ruta de salto.',
    scanTextareaPlaceholder: 'ej. Un robot pesado, silencioso y resistente',
    scanFallbackPrompt: 'Un robot equilibrado y versatil',
    scanPresetSpeedLabel: '⚡ Ninja veloz',
    scanPresetSpeedPrompt: 'Un robot ninja agil, rapido y de mirada afilada',
    scanPresetPowerLabel: '💪 Potencia bruta',
    scanPresetPowerPrompt: 'Un robot musculoso, duro y centrado en la fuerza',
    scanPresetCharmLabel: '🎤 Idol carismatico',
    scanPresetCharmPrompt: 'Un robot alegre y expresivo que cautiva al publico',
    summonTitle: 'Fase 1.3: Primera invocacion',
    summonDesc: 'Escanea el suelo o una mesa real para colocar e invocar a tu companero AI.',
    summonProceedNoAr: 'Ir al menu principal (sin soporte AR)',
    summonSkipAr: 'Saltar invocacion AR',
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
    arStatusOff: 'Vista normal',
    arStatusReady: 'Superficie lista',
    arStatusTracking: 'Siguiendo',
    arStatusSearching: 'Buscando superficie',
    heatOn: 'Activo',
    heatOff: 'Normal',
    toneBalanced: 'Balanceado',
    toneAggressive: 'Agresivo',
    toneCool: 'Frio',
    toneFun: 'Jugueton',
    toneFocused: 'Enfocado',
    toneDistrustful: 'Desconfiado',
    matchResultWin: 'Victoria',
    matchResultLose: 'Derrota',
    matchResultDraw: 'Empate',
    matchUnit: 'batallas',
    sessionUnit: 'sesiones',
    hp: 'HP',
    enemyHp: 'HP rival',
    heat: 'Heat',
    noMemory: 'Sin resumen de memoria',
    memoryUnreadable: 'La memoria se esta ordenando. Solo se muestran eventos legibles.',
    memoryWalkLabel: 'Paseo',
    memoryTrainingLabel: 'Entreno',
    memoryMatchLabel: 'Batalla',
    memoryInsightLabel: 'Insight',
    memoryToneShiftLabel: 'Cambio de tono',
    memoryAccuracyLabel: 'Precision',
    memorySpeedLabel: 'Velocidad',
    memoryPassionLabel: 'Pasion',
    memoryItemsLabel: 'Hallazgos',
    memoryReflectionLabel: 'Reflexiones',
    memoryCriticalLabel: 'Criticos',
    memoryMissLabel: 'Fallos',
    memoryHighlightsLabel: 'Momentos clave',
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
    flowOpenSettings: 'Abrir Ajustes',
    battleOnlyHint: 'Esta accion solo esta disponible en modo batalla.',
    settingsTitle: 'Ajustes',
    settingsDesc: 'Usa esta zona para cambiar idioma y otras opciones secundarias.',
    quickActions: 'Acciones rapidas',
    closeMenu: 'Cerrar',
    liveRoutingTitle: 'Rutas Live',
    liveConversationRoute: 'Conversacion',
    liveBattleRoute: 'Asistencia tactica',
    liveCommentaryRoute: 'Comentario',
    liveVisionRoute: 'Disparador visual',
    liveAdkStatus: 'ADK Live',
    liveStatusLabel: 'Estado',
    liveDegradedReason: 'Motivo',
    liveAvailable: 'Disponible',
    liveUnavailable: 'No disponible',
    livePending: 'Verificando',
    currentLanguage: 'Idioma actual',
    languageSettingHint: 'Puedes volver aqui mas tarde para cambiar el idioma cuando quieras.',
    languageChangeAfterMatch: 'No puedes cambiar el idioma durante una batalla. Vuelve al hub primero.',
    debugSection: 'Live / Debug',
    debugBattleState: 'Estado de batalla',
    debugAdkTactic: 'Tactica ADK',
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
    routeGuideDoneDesc: 'La ruta inicial recomendada ya esta completada. Abre el detalle solo cuando lo necesites.',
    routeOpenCompleted: 'Abrir detalle',
    routeHideCompleted: 'Cerrar',
    prepTitle: 'Briefing previo a batalla',
    prepDesc: 'Revisa progreso de ruta y configuracion del robot antes de combatir.',
    prepStepRoute: 'Ruta recomendada',
    prepStepModel: 'Modelo de robot',
    prepStepPalette: 'Color',
    prepOwnMachine: 'Tu maquina',
    prepEnemyMachine: 'Maquina rival',
    prepEnemyFrame: 'Tipo rival',
    prepEnemyPalette: 'Color rival',
    prepStepAlign: 'Accion inicial',
    prepReady: 'Listo',
    prepGuide: 'Revisar',
    prepMissing: 'Pendiente',
    prepAlignGuide: 'Alinear arena al iniciar batalla',
    prepSelectFrame: 'Lista de maquinas',
    prepMaterialWood: 'Madera',
    prepMaterialResin: 'Resina',
    prepMaterialMetal: 'Metal',
    prepBodyHeavy: 'Pesado',
    prepBodySlim: 'Ligero',
    prepBodyHeavyDesc: 'Armazon pesado orientado a potencia',
    prepBodySlimDesc: 'Armazon agil y heroico',
    prepPaletteMarine: 'Marino',
    prepPaletteEmber: 'Ascua',
    prepPaletteForest: 'Bosque',
    prepPaletteRoyal: 'Real',
    prepPaletteObsidian: 'Obsidiana',
    prepPaletteSunset: 'Atardecer',
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
    applyLanguage: 'Aplicar',
    exGaugeLabel: 'EX',
    fusionLaunch: 'Fusion Craft',
    walkFocusTitle: 'Observa el entorno y recoge materiales',
    walkFocusDesc: 'El paseo sirve para explorar y conversar. Activa craft u observacion y termina el paseo cuando acabes.',
    trainingFocusTitle: 'Afina el canto y los reflejos',
    trainingFocusDesc: 'El entrenamiento mejora la sincronizacion. Llena EX, prueba la invocacion y termina la sesion al acabar.',
    matchFocusTitle: 'Foco principal del combate',
    matchFocusDesc: 'Durante la batalla concentrate en alineacion, esquiva y especial. Las acciones de crecimiento no deben invadir esta pantalla.',
    fusionTitle: 'Real-World Fusion Craft',
    fusionHint: 'Captura un objeto real y define el concepto que quieres fusionar con tu robot.',
    fusionCapturePrompt: 'Capturar o subir',
    fusionConceptLabel: 'Concepto de fusion',
    fusionConceptPlaceholder: 'ej. Espada sagrada laser / Escudo de madera / Armadura de carbono',
    fusionBegin: 'Iniciar Fusion',
    fusionGenerating: 'Fusionando esencia y generando textura…',
    fusionWaiting: 'Esperando el resultado generado…',
    fusionSuccess: 'Fusion completa',
    fusionSuccessBody: 'El nuevo material ya se sincronizo con tu maquina. Sigue el paseo o terminalo para avanzar.',
    fusionRetry: 'Reintentar',
    fusionRetake: 'Tomar otra',
    fusionClose: 'Volver al paseo',
    fusionValidation: 'Se requieren imagen y concepto.',
    fusionError: 'Fusion Craft fallo',
    scanEquipmentModeLabel: 'Salida del escaneo',
    scanEquipmentModeSkin: 'Piel',
    scanEquipmentModeAttachment: 'Accesorio',
    scanEquipmentMountLabel: 'Punto de montaje',
    scanEquipmentPromptLabel: 'Concepto del accesorio',
    scanEquipmentPromptPlaceholder: 'ej. Espada de rollito / Visor frontal / Mochila propulsora',
    scanEquipmentGenerating: 'Generando el accesorio…',
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
  const initialSelectedLanguage = canonicalizeLocale(
    (() => {
      try {
        return localStorage.getItem(STORAGE_LANG_KEY) || PLAYER_LANG;
      } catch {
        return PLAYER_LANG;
      }
    })(),
  );
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialSelectedLanguage);
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string> | null>(
    () => loadCachedTranslations(initialSelectedLanguage),
  );
  const [translationRevision, setTranslationRevision] = useState(0);
  const activeLocale = canonicalizeLocale(selectedLanguage || PLAYER_LANG);
  const uiLang = resolveBaseUiLang(activeLocale);
  // Merge built-in dictionary with any Gemini-generated cached translations.
  // For ja/en/es the cache will be empty so this is a no-op.
  const t = dynamicTranslations
    ? { ...UI_TEXT[uiLang], ...dynamicTranslations } as typeof UI_TEXT['en']
    : UI_TEXT[uiLang];
  const { isSetupDone, isGenerating, generateCharacter } = useCharacterSetup();
  const { isStreaming, startStream, stopStream } = useAudioStreamer();
  const setCastingSpecial = useFSMStore(s => s.setCastingSpecial);
  const resolveSpecialResult = useFSMStore(s => s.resolveSpecialResult);
  const setRobotStats = useFSMStore(s => s.setRobotStats);
  const robotDna = useFSMStore(s => s.robotDna);
  const robotMaterial = useFSMStore(s => s.robotMeta.material);
  const currentModelType = useFSMStore(s => s.modelType);
  const enemyModelType = useFSMStore(s => s.enemyModelType);
  const setModelType = useFSMStore(s => s.setModelType);
  const setEnemyModelType = useFSMStore(s => s.setEnemyModelType);
  const setRobotDna = useFSMStore(s => s.setRobotDna);
  const enemyRobotDna = useFSMStore(s => s.enemyRobotDna);
  const setEnemyRobotDna = useFSMStore(s => s.setEnemyRobotDna);
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

  useEffect(() => {
    setDynamicTranslations(loadCachedTranslations(activeLocale));
  }, [activeLocale, translationRevision]);

  const requestedTranslationLocaleRef = useRef('');
  const languagePresets = mergeLanguagePresets(selectedLanguage);
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
  const [fusionCraftFlow, setFusionCraftFlow] = useState<FusionCraftFlowState>({
    status: 'idle',
    requestId: '',
    concept: '',
    message: '',
    textureUrl: '',
    craftKind: 'skin',
    mountPoint: 'WEAPON_R',
  });
  useEffect(() => {
    if (playMode !== 'walk') {
      setShowFusionCraft(false);
    }
  }, [playMode]);
  const {
    connectLiveDirect,
    disconnectLiveDirect,
    isLiveConnected,
    isLiveMicActive,
    liveDebugInfo,
    pendingLiveConnectRef,
    requestBattleCoaching,
    requestBattleStateSnapshot,
    requestInteractionTurn,
    requestLiveEphemeralToken,
    requestTacticalRecommendation,
    sendLiveTextPing,
    setLiveDebugInfo,
    toggleLiveMic,
  } = useLiveSessionControls({
    liveNeedConnectionText: t.liveNeedConnection,
  });
  const liveRouteSelector = useLiveRouteSelector(resolveConfiguredLivePolicyPhase());
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
  useEffect(() => {
    if (playMode !== 'match' || isMatchPaused || !matchAlignmentReady) return;
    requestBattleCoaching();
    const timer = window.setInterval(() => {
      requestBattleCoaching();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [isMatchPaused, matchAlignmentReady, playMode, requestBattleCoaching]);
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
  const queuePendingTranslation = (langCode: string) => {
    try {
      localStorage.setItem(STORAGE_PENDING_TRANSLATION_KEY, canonicalizeLocale(langCode));
    } catch {
      // noop
    }
  };

  const clearPendingTranslation = (langCode?: string) => {
    try {
      const pending = localStorage.getItem(STORAGE_PENDING_TRANSLATION_KEY);
      if (!pending) return;
      if (!langCode || canonicalizeLocale(pending) === canonicalizeLocale(langCode)) {
        localStorage.removeItem(STORAGE_PENDING_TRANSLATION_KEY);
      }
    } catch {
      // noop
    }
  };

  const requestUiTranslations = (langCode: string) => {
    const canonical = canonicalizeLocale(langCode);
    const baseDict = UI_TEXT[resolveBaseUiLang(canonical)];
    requestedTranslationLocaleRef.current = canonical;
    wsService.sendEvent({
      event: 'request_ui_translations',
      user: PLAYER_ID,
      payload: { lang: canonical, base_keys: baseDict as unknown as Record<string, string> },
    });
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: `Generating ${canonical} translations…` }
    }));
  };

  const requestPendingTranslationIfNeeded = () => {
    let pendingLocale = '';
    try {
      pendingLocale = localStorage.getItem(STORAGE_PENDING_TRANSLATION_KEY) || '';
    } catch {
      pendingLocale = '';
    }
    const canonical = canonicalizeLocale(pendingLocale || selectedLanguage, selectedLanguage);
    if (localeUsesBuiltinDictionary(canonical) || loadCachedTranslations(canonical)) {
      requestedTranslationLocaleRef.current = '';
      clearPendingTranslation(canonical);
      return;
    }
    if (requestedTranslationLocaleRef.current === canonical) return;
    requestUiTranslations(canonical);
  };

  const proceedToMain = () => {
    switchMode('hub');
    setAppPhase('main');
    window.setTimeout(() => {
      requestPendingTranslationIfNeeded();
    }, 0);
  };

  const applyLanguage = (langCode: string, markAsChosen: boolean) => {
    const canonical = canonicalizeLocale(langCode);
    setSelectedLanguage(canonical);
    rememberRecentLocale(canonical);
    try {
      localStorage.setItem(STORAGE_LANG_KEY, canonical);
      if (markAsChosen) {
        localStorage.setItem(STORAGE_LANG_SELECTED_KEY, 'done');
      }
      console.info(`[App] Language applied: ${canonical} (chosen: ${markAsChosen})`);
    } catch (err) {
      console.warn('[App] Failed to save language choice', err);
    }
    const hasBuiltIn = localeUsesBuiltinDictionary(canonical);
    const existingCache = loadCachedTranslations(canonical);
    console.info(`[App] Checking translation for ${canonical} - BuiltIn: ${hasBuiltIn}, Cached: ${!!existingCache}`);
    if (hasBuiltIn || existingCache) {
      clearPendingTranslation(canonical);
      console.info(`[App] Reloading to apply translations immediately`);
      window.location.reload();
      return;
    }
    if (appPhase === 'main' && wsService.isConnected()) {
      requestUiTranslations(canonical);
      return;
    }
    queuePendingTranslation(canonical);
    window.location.reload();
  };

  useEffect(() => {
    const maybeRequestPendingTranslation = () => {
      if (appPhase !== 'main') return;
      requestPendingTranslationIfNeeded();
    };

    maybeRequestPendingTranslation();
    const onSocketStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean }>).detail;
      if (detail?.connected) {
        maybeRequestPendingTranslation();
      }
    };
    window.addEventListener('plares_ws_status', onSocketStatus as EventListener);
    return () => {
      window.removeEventListener('plares_ws_status', onSocketStatus as EventListener);
    };
  }, [appPhase, selectedLanguage]);
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
      detail: { text: t.startTraining },
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
      detail: { text: t.startWalk },
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
    const route = liveRouteSelector.resolve('vision_trigger');
    if (route.primary !== 'game_event_ws') {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: route.note },
      }));
      setLiveDebugInfo((prev) => ({
        ...prev,
        lastStatus: 'vision_trigger_route_blocked',
        degradedReason: route.note,
      }));
      return;
    }
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
    setFusionCraftFlow,
    setRobotDna,
    setRobotStats,
    saveTranslations: (langCode, dict) => {
      saveCachedTranslations(langCode, dict);
      clearPendingTranslation(langCode);
      if (canonicalizeLocale(langCode) === activeLocale) {
        setDynamicTranslations(dict);
      }
      setTranslationRevision(prev => prev + 1);
    },
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

  const submitFusionCraftRequest = (payload: {
    requestId: string;
    concept: string;
    referenceImage: string;
    craftKind: 'skin' | 'attachment';
    mountPoint: 'WEAPON_R' | 'WEAPON_L' | 'HEAD_ACCESSORY' | 'BACKPACK';
  }) => {
    setFusionCraftFlow({
      status: 'submitting',
      requestId: payload.requestId,
      concept: payload.concept,
      message: payload.craftKind === 'attachment' ? t.scanEquipmentGenerating : t.fusionGenerating,
      textureUrl: '',
      craftKind: payload.craftKind,
      mountPoint: payload.mountPoint,
    });
    wsService.sendEvent({
      event: 'item_dropped',
      user: PLAYER_ID,
      payload: {
        action: 'request_fusion',
        craft_request: true,
        request_id: payload.requestId,
        concept: payload.concept,
        image_data: payload.referenceImage,
        reference_image: payload.referenceImage,
        craft_kind: payload.craftKind,
        mount_point: payload.mountPoint,
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
    setIsBattlePrepOpen(false);
    setShowFusionCraft(false);
    setIsProfileOpen(false);
    setIsMatchPaused(false);
    setTrainingSession(null);
    setWalkSession(null);
    switchMode('hub');
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: t.flowReturnHub },
    }));
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
  const entryScreensProps = useEntryScreenProps({
    appPhase,
    t,
    languagePresets,
    selectedLanguage,
    applyLanguage: (langCode, persistSelection = false) => applyLanguage(langCode, persistSelection),
    setSelectedLanguage,
    onGenerateCharacter: generateCharacter,
    isGenerating,
    arSupportState,
    onEnterAr: handleEnterAr,
    onProceedToMain: proceedToMain,
  });
  const mainHudProps = useMainHudProps({
    isMainPhase,
    t,
    characterLabEnabled: CHARACTER_LAB_UI,
    currentModelType,
    enemyModelType,
    onSelectModelType: (type) => {
      setModelType(type);
    },
    onSelectEnemyModelType: (type) => {
      setEnemyModelType(type);
    },
    onSelectPaletteFamily: (paletteFamily) => {
      setRobotDna({
        ...robotDna,
        paletteFamily,
      });
    },
    onSelectEnemyPaletteFamily: (paletteFamily) => {
      setEnemyRobotDna({
        ...enemyRobotDna,
        paletteFamily,
      });
    },
    playMode,
    isHubMode,
    showBattleHud,
    debugVisible,
    isArButtonDisabled,
    arButtonLabel,
    arButtonTitle,
    isProfileOpen,
    isShareOpen,
    isLabOpen,
    isBattlePrepOpen,
    showFusionCraft,
    fusionCraftFlow,
    isP2PMediaOn,
    isLiveConnected,
    isLiveMicActive,
    liveActionDisabled,
    isMatchPaused,
    isStreaming,
    isSolo,
    alignmentReady,
    matchAlignmentReady,
    hasWalkMilestone,
    hasTrainingMilestone,
    hasRouteFoundation,
    recentABFeedbackCount,
    languagePresets,
    selectedLanguage,
    modeLabel,
    scanState,
    scanPointCount,
    isARSessionActive,
    walkSession,
    trainingSession,
    specialPhrase,
    battleState,
    profileInfo,
    profileView,
    liveDebugInfo,
    bgmUrl,
    robotDna,
    enemyRobotDna,
    robotMaterial,
    localHp,
    enemyHp,
    routeNextStep,
    routeSteps,
    onEnterAr: handleEnterAr,
    onRequestMatchEnd: requestMatchEnd,
    onPublishArenaCalibration: publishArenaCalibration,
    onToggleProfile: () => setIsProfileOpen((open) => !open),
    onOpenProfile: openProfile,
    onOpenShare: () => setIsShareOpen(true),
    onOpenLab: () => setIsLabOpen(true),
    onCloseLab: () => setIsLabOpen(false),
    onToggleDebug: () => setDebugVisible((visible) => !visible),
    onStartWalk: startWalk,
    onStartTraining: startTraining,
    onCompleteWalk: completeWalk,
    onCompleteTraining: completeTraining,
    onOpenBattlePrep: openBattlePrep,
    onCloseBattlePrep: () => setIsBattlePrepOpen(false),
    onEnterBattleMode: enterBattleMode,
    onOpenFusionCraft: () => setShowFusionCraft(true),
    onCloseFusionCraft: () => setShowFusionCraft(false),
    onSubmitFusionCraft: submitFusionCraftRequest,
    onRequestProfileSync: requestProfileSync,
    onToggleLiveConnection: isLiveConnected ? disconnectLiveDirect : connectLiveDirect,
    onToggleLiveMic: toggleLiveMic,
    onSendLiveTextPing: sendLiveTextPing,
    onRequestBattleStateSnapshot: requestBattleStateSnapshot,
    onRequestTacticalRecommendation: () => requestTacticalRecommendation('take_cover'),
    onReturnToHub: returnToHub,
    onWalkVisionOrProfileSync: playMode === 'walk' ? sendWalkVisionTrigger : requestProfileSync,
    onSendWalkVisionTrigger: sendWalkVisionTrigger,
    onRequestFusionDrop: requestFusionDrop,
    onRequestLiveEphemeralToken: requestLiveEphemeralToken,
    onRequestInteractionTurn: requestInteractionTurn,
    onHandleCastSpecial: () => {
      void handleCastSpecial();
    },
    onToggleP2PMedia: () => {
      void toggleP2PMedia();
    },
    onTriggerRecommendedRouteStep: triggerRecommendedRouteStep,
    onChangeLanguage: (nextLanguage) => {
      setSelectedLanguage(nextLanguage);
      applyLanguage(nextLanguage, true);
    },
    onSubmitDnaFeedback: (payload) => {
      submitDnaABFeedback(payload);
      setIsLabOpen(false);
    },
  });

  return (
    <div className="arena-shell" ref={overlayRef}>
      <div className="arena-atmosphere" aria-hidden />
      <AppOverlayRouter
        isMainPhase={isMainPhase}
        entryScreensProps={entryScreensProps}
        mainHudProps={mainHudProps}
      />
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
