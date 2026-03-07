import { useMemo } from 'react';
import { canonicalizeLocale, type LanguagePreset } from '../i18n/runtime';
import type { AppEntryScreensProps } from '../components/app/AppEntryScreens';
import type { AppMainHudProps } from '../components/app/AppMainHud';
import type { ModelTypeId } from '../constants/modelTypes';
import type { MountPointId } from '../components/robot/constants';
import type {
  ArSupportState,
  BattleUiState,
  DnaAbFeedbackPayload,
  FusionCraftFlowState,
  ModeSession,
  ProfileInfo,
  RouteStatus,
  RouteStepKey,
  UiText,
  LiveDebugInfo,
} from '../types/app';
import type { CharacterDNA } from '../../../shared/types/firestore';
import type { PlayMode } from '../store/useFSMStore';

type UseEntryScreenPropsArgs = {
  appPhase: AppEntryScreensProps['appPhase'];
  t: UiText;
  languagePresets: LanguagePreset[];
  selectedLanguage: string;
  applyLanguage: (langCode: string, persistSelection?: boolean) => void;
  setSelectedLanguage: (langCode: string) => void;
  onGenerateCharacter: AppEntryScreensProps['onGenerateCharacter'];
  isGenerating: boolean;
  arSupportState: ArSupportState;
  isARSessionActive: boolean;
  onEnterAr: () => Promise<void> | void;
  onProceedToMain: () => void;
  onResetSetup: () => void;
};

type UseMainHudPropsArgs = {
  isMainPhase: boolean;
  t: UiText;
  characterLabEnabled: boolean;
  currentModelType: ModelTypeId;
  enemyModelType: ModelTypeId;
  onSelectModelType: (type: ModelTypeId) => void;
  onSelectEnemyModelType: (type: ModelTypeId) => void;
  onSelectPaletteFamily: (palette: CharacterDNA['paletteFamily']) => void;
  onSelectEnemyPaletteFamily: (palette: CharacterDNA['paletteFamily']) => void;
  playMode: PlayMode;
  isHubMode: boolean;
  showBattleHud: boolean;
  debugVisible: boolean;
  isArButtonDisabled: boolean;
  arButtonLabel: string;
  arButtonTitle: string;
  isProfileOpen: boolean;
  isShareOpen: boolean;
  isLabOpen: boolean;
  isBattlePrepOpen: boolean;
  showFusionCraft: boolean;
  fusionCraftFlow: FusionCraftFlowState;
  isP2PMediaOn: boolean;
  isLiveConnected: boolean;
  isLiveMicActive: boolean;
  liveActionDisabled: boolean;
  isMatchPaused: boolean;
  isStreaming: boolean;
  isSolo: boolean;
  alignmentReady: boolean;
  matchAlignmentReady: boolean;
  hasWalkMilestone: boolean;
  hasTrainingMilestone: boolean;
  hasRouteFoundation: boolean;
  recentABFeedbackCount: number;
  languagePresets: LanguagePreset[];
  selectedLanguage: string;
  modeLabel: string;
  scanState: string;
  scanPointCount: number;
  isARSessionActive: boolean;
  walkSession: ModeSession | null;
  trainingSession: ModeSession | null;
  specialPhrase: string;
  battleState: BattleUiState;
  profileInfo: ProfileInfo | null;
  profileView: ProfileInfo;
  liveDebugInfo: LiveDebugInfo;
  bgmUrl: string;
  robotDna: CharacterDNA;
  enemyRobotDna: CharacterDNA;
  robotMaterial: 'Wood' | 'Metal' | 'Resin';
  localHp: number;
  enemyHp: number;
  routeNextStep: RouteStepKey | 'complete';
  routeSteps: Array<{ key: RouteStepKey; label: string; status: RouteStatus }>;
  onEnterAr: () => Promise<void> | void;
  onRequestMatchEnd: () => void;
  onPublishArenaCalibration: () => void;
  onToggleProfile: () => void;
  onOpenProfile: () => void;
  onOpenShare: () => void;
  onOpenLab: () => void;
  onCloseLab: () => void;
  onToggleDebug: () => void;
  onStartWalk: () => void;
  onStartTraining: () => void;
  onCompleteWalk: () => void;
  onCompleteTraining: () => void;
  onOpenBattlePrep: () => void;
  onCloseBattlePrep: () => void;
  onEnterBattleMode: () => void;
  onOpenFusionCraft: () => void;
  onCloseFusionCraft: () => void;
  onSubmitFusionCraft: (payload: {
    requestId: string;
    concept: string;
    referenceImage: string;
    craftKind: 'skin' | 'attachment';
    mountPoint: MountPointId;
  }) => void;
  onRequestProfileSync: () => void;
  onToggleLiveConnection: () => void;
  onToggleLiveMic: () => void;
  onSendLiveTextPing: () => void;
  onRequestBattleStateSnapshot: () => void;
  onRequestTacticalRecommendation: () => void;
  onReturnToHub: () => void;
  onWalkVisionOrProfileSync: () => void;
  onSendWalkVisionTrigger: () => void;
  onRequestFusionDrop: () => void;
  onRequestLiveEphemeralToken: () => void;
  onRequestInteractionTurn: () => void;
  onHandleCastSpecial: () => void;
  onToggleP2PMedia: () => void;
  onTriggerRecommendedRouteStep: () => void;
  onChangeLanguage: (nextLanguage: string) => void;
  onSubmitDnaFeedback: (payload: DnaAbFeedbackPayload) => void;
};

export const useEntryScreenProps = ({
  appPhase,
  t,
  languagePresets,
  selectedLanguage,
  applyLanguage,
  setSelectedLanguage,
  onGenerateCharacter,
  isGenerating,
  arSupportState,
  isARSessionActive,
  onEnterAr,
  onProceedToMain,
  onResetSetup,
}: UseEntryScreenPropsArgs): AppEntryScreensProps =>
  useMemo(
    () => ({
      appPhase,
      t,
      languagePresets,
      selectedLanguage,
      onApplyLanguage: (langCode) => {
        const canonical = canonicalizeLocale(langCode);
        setSelectedLanguage(canonical);
        applyLanguage(canonical, true);
      },
      onGenerateCharacter,
      isGenerating,
      arSupportState,
      isARSessionActive,
      onEnterAr: () => {
        void onEnterAr();
      },
      onProceedToMain,
      onResetSetup,
    }),
    [
      appPhase,
      t,
      languagePresets,
      selectedLanguage,
      applyLanguage,
      setSelectedLanguage,
      onGenerateCharacter,
      isGenerating,
      arSupportState,
      isARSessionActive,
      onEnterAr,
      onProceedToMain,
      onResetSetup,
    ],
  );

export const useMainHudProps = ({
  isMainPhase,
  ...args
}: UseMainHudPropsArgs): AppMainHudProps | null =>
  useMemo(() => {
    if (!isMainPhase) return null;
    return args;
  }, [isMainPhase, args]);
