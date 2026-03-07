import type { FC } from 'react';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { EX_GAUGE } from '../../../../shared/constants/battleConstants';
import { CharacterLabPanel } from '../ui/CharacterLabPanel';
import { BattlePrepOverlay } from './BattlePrepOverlay';
import { FlowHubScreen } from './FlowHubScreen';
import { PlayModeScreen } from './PlayModeScreen';
import { ProfilePanel } from './ProfilePanel';
import type {
  BattleUiState,
  DnaAbFeedbackPayload,
  FusionCraftFlowState,
  LiveDebugInfo,
  ModeSession,
  ProfileInfo,
  RouteStatus,
  RouteStepKey,
  UiText,
} from '../../types/app';
import type { LanguagePreset } from '../../i18n/runtime';
import type { PlayMode } from '../../store/useFSMStore';
import type { ModelTypeId } from '../../constants/modelTypes';
import type { MountPointId } from '../robot/constants';

export type AppMainHudProps = {
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
  onEnterAr: () => void;
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

export const AppMainHud: FC<AppMainHudProps> = ({
  t,
  characterLabEnabled,
  currentModelType,
  enemyModelType,
  onSelectModelType,
  onSelectEnemyModelType,
  onSelectPaletteFamily,
  onSelectEnemyPaletteFamily,
  playMode,
  isHubMode,
  showBattleHud,
  debugVisible,
  isArButtonDisabled,
  arButtonLabel,
  arButtonTitle,
  isProfileOpen,
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
  onEnterAr,
  onRequestMatchEnd,
  onPublishArenaCalibration,
  onToggleProfile,
  onOpenProfile,
  onOpenShare,
  onOpenLab,
  onCloseLab,
  onToggleDebug,
  onStartWalk,
  onStartTraining,
  onCompleteWalk,
  onCompleteTraining,
  onOpenBattlePrep,
  onCloseBattlePrep,
  onEnterBattleMode,
  onOpenFusionCraft,
  onCloseFusionCraft,
  onSubmitFusionCraft,
  onRequestProfileSync,
  onToggleLiveConnection,
  onToggleLiveMic,
  onSendLiveTextPing,
  onRequestBattleStateSnapshot,
  onRequestTacticalRecommendation,
  onReturnToHub,
  onWalkVisionOrProfileSync,
  onSendWalkVisionTrigger,
  onRequestFusionDrop,
  onRequestLiveEphemeralToken,
  onRequestInteractionTurn,
  onHandleCastSpecial,
  onToggleP2PMedia,
  onTriggerRecommendedRouteStep,
  onChangeLanguage,
  onSubmitDnaFeedback,
}) => (
  <>
    {characterLabEnabled && profileInfo && (
      <CharacterLabPanel
        open={isLabOpen}
        onClose={onCloseLab}
        baseDna={robotDna}
        material={robotMaterial}
        totalMatches={profileInfo.totalMatches}
        recentFeedbackCount={recentABFeedbackCount}
        onSubmit={onSubmitDnaFeedback}
      />
    )}

    <PlayModeScreen
      t={t}
      playMode={playMode}
      walkSession={walkSession}
      trainingSession={trainingSession}
      specialPhrase={specialPhrase}
      battleState={battleState}
      showBattleHud={showBattleHud}
      alignmentReady={alignmentReady}
      isProfileOpen={isProfileOpen}
      showFusionCraft={showFusionCraft}
      fusionCraftFlow={fusionCraftFlow}
      onOpenFusionCraft={onOpenFusionCraft}
      onCloseFusionCraft={onCloseFusionCraft}
      onSubmitFusionCraft={onSubmitFusionCraft}
      onCompleteWalk={onCompleteWalk}
      onSendWalkVisionTrigger={onSendWalkVisionTrigger}
      onStartTraining={onStartTraining}
      onCompleteTraining={onCompleteTraining}
      onHandleCastSpecial={onHandleCastSpecial}
      onOpenBattlePrep={onOpenBattlePrep}
      onReturnToHub={onReturnToHub}
    />

    <header className="hud-top-left hud-animate">
      <div className="hud-brand">
        <div className="hud-brand-main">plARes</div>
      </div>
      <div className="hud-inline-actions">
        <button
          id="btn-enter-ar"
          className={`hud-btn hud-btn-steel hud-btn-mini ${isArButtonDisabled ? 'is-disabled' : ''}`}
          onClick={onEnterAr}
          disabled={isArButtonDisabled}
          title={arButtonTitle}
        >
          {arButtonLabel}
        </button>
        {debugVisible && playMode === 'match' && (
          <button
            id="btn-match-end"
            className="hud-btn hud-btn-danger hud-btn-mini"
            onClick={onRequestMatchEnd}
          >
            {t.endMatch}
          </button>
        )}
        {playMode === 'match' && !isArButtonDisabled && (
          <button
            id="btn-arena-align"
            className="hud-btn hud-btn-blue hud-btn-mini"
            onClick={onPublishArenaCalibration}
          >
            {t.alignArena}
          </button>
        )}
        <button
          id="btn-menu-toggle"
          className="hud-btn hud-btn-carbon hud-btn-mini"
          onClick={onToggleProfile}
        >
          {t.menu}
        </button>
        {playMode === 'match' && (
          <button
            id="btn-arena-share"
            className="hud-btn hud-btn-teal hud-btn-mini hud-desktop-only"
            onClick={onOpenShare}
          >
            {t.share}
          </button>
        )}
        {characterLabEnabled && (
          <button
            id="btn-open-lab"
            className="hud-btn hud-btn-carbon hud-btn-mini hud-desktop-only"
            onClick={onOpenLab}
          >
            Lab
          </button>
        )}
        <button
          id="btn-debug-toggle"
          className={`hud-btn hud-btn-mini hud-desktop-only ${debugVisible ? 'hud-btn-warn' : 'hud-btn-carbon'}`}
          onClick={onToggleDebug}
          title="Toggle debug panels"
        >
          {debugVisible ? '🛠 DEBUG ON' : '🛠 DEBUG'}
        </button>
      </div>
    </header>

    {isHubMode && (
      <FlowHubScreen
        t={t}
        profileView={profileView}
        selectedLanguage={selectedLanguage}
        routeNextStep={routeNextStep}
        routeSteps={routeSteps}
        onTriggerRecommendedRouteStep={onTriggerRecommendedRouteStep}
        onStartWalk={onStartWalk}
        onStartTraining={onStartTraining}
        onOpenBattlePrep={onOpenBattlePrep}
        onRequestProfileSync={onRequestProfileSync}
        onOpenProfile={onOpenProfile}
      />
    )}

    {isBattlePrepOpen && (
      <BattlePrepOverlay
        t={t}
        hasRouteFoundation={hasRouteFoundation}
        isSolo={isSolo}
        currentModelType={currentModelType}
        enemyModelType={enemyModelType}
        robotDna={robotDna}
        enemyRobotDna={enemyRobotDna}
        alignmentReady={alignmentReady}
        hasWalkMilestone={hasWalkMilestone}
        hasTrainingMilestone={hasTrainingMilestone}
        onSelectModelType={onSelectModelType}
        onSelectEnemyModelType={onSelectEnemyModelType}
        onSelectPaletteFamily={onSelectPaletteFamily}
        onSelectEnemyPaletteFamily={onSelectEnemyPaletteFamily}
        onStartWalk={onStartWalk}
        onStartTraining={onStartTraining}
        onEnterBattleMode={onEnterBattleMode}
        onCloseBattlePrep={onCloseBattlePrep}
      />
    )}

    {showBattleHud && (
      <div className="hud-battle-status-rail">
        <div className="hud-battle-status-block is-local">
          <div className="hud-battle-status-head">
            <span>{t.hp}</span>
            <strong>{isSolo ? localHp : battleState.hp}/{battleState.maxHp}</strong>
          </div>
          <div className="hud-hp-track">
            <div
              className={`hud-hp-fill ${localHp < 30 ? 'critical' : ''}`}
              style={{ width: `${isSolo ? localHp : (battleState.maxHp > 0 ? (battleState.hp / battleState.maxHp) * 100 : 0)}%` }}
            />
          </div>
        </div>
        <div className="hud-battle-status-center">
          <div className="hud-hp-vs">VS</div>
          <div className="hud-battle-status-ex">{`EX ${battleState.exGauge}/${EX_GAUGE.MAX}`}</div>
        </div>
        <div className="hud-battle-status-block is-remote">
          <div className="hud-battle-status-head">
            <span>{t.enemyHp}</span>
            <strong>{isSolo ? enemyHp : battleState.opponentHp}/{battleState.opponentMaxHp}</strong>
          </div>
          <div className="hud-hp-track">
            <div
              className={`hud-hp-fill ${enemyHp < 30 ? 'critical' : ''}`}
              style={{ width: `${isSolo ? enemyHp : (battleState.opponentMaxHp > 0 ? (battleState.opponentHp / battleState.opponentMaxHp) * 100 : 0)}%` }}
            />
          </div>
        </div>
      </div>
    )}

    {isARSessionActive && playMode === 'hub' && !showBattleHud && !isProfileOpen && (
      <div className="hud-ar-session-bar">
        <div className="hud-ar-session-copy">
          <div className="hud-ar-session-mode">{modeLabel}</div>
          <div className="hud-ar-session-note">
            {alignmentReady ? (t.alignReady ?? 'Alignment ready') : (t.prepAlignGuide ?? 'Scan a surface and prepare the arena.')}
          </div>
        </div>
        <div className="hud-ar-session-actions">
          <button className="hud-btn hud-btn-mini hud-btn-blue" onClick={onOpenBattlePrep}>
            {t.prepTitle}
          </button>
          <button className="hud-btn hud-btn-mini hud-btn-carbon" onClick={onOpenProfile}>
            {t.menu}
          </button>
        </div>
      </div>
    )}

    <ProfilePanel
      t={t}
      alignmentReady={alignmentReady}
      languagePresets={languagePresets}
      selectedLanguage={selectedLanguage}
      onChangeLanguage={onChangeLanguage}
      onRequestProfileSync={onRequestProfileSync}
      isLiveConnected={isLiveConnected}
      isLiveMicActive={isLiveMicActive}
      liveActionDisabled={liveActionDisabled}
      onToggleLiveConnection={onToggleLiveConnection}
      onToggleLiveMic={onToggleLiveMic}
      onSendLiveTextPing={onSendLiveTextPing}
      onRequestBattleStateSnapshot={onRequestBattleStateSnapshot}
      onRequestTacticalRecommendation={onRequestTacticalRecommendation}
      playMode={playMode}
      onReturnToHub={onReturnToHub}
      onOpenBattlePrep={onOpenBattlePrep}
      onStartTraining={onStartTraining}
      onCompleteTraining={onCompleteTraining}
      trainingSession={trainingSession}
      onStartWalk={onStartWalk}
      onCompleteWalk={onCompleteWalk}
      walkSession={walkSession}
      onOpenFusionCraft={onOpenFusionCraft}
      onSendWalkVisionTrigger={onSendWalkVisionTrigger}
      onWalkVisionOrProfileSync={onWalkVisionOrProfileSync}
      modeLabel={modeLabel}
      isARSessionActive={isARSessionActive}
      scanState={scanState}
      scanPointCount={scanPointCount}
      profileView={profileView}
      battleState={battleState}
      debugVisible={debugVisible}
      liveDebugInfo={liveDebugInfo}
      bgmUrl={bgmUrl}
      isProfileOpen={isProfileOpen}
      onToggleProfile={onToggleProfile}
    />

    {debugVisible && showBattleHud && (
      <div className="hud-right-rail hud-animate" style={{ borderLeft: '2px solid #ff6b6b' }}>
        <div style={{ fontSize: '0.7rem', color: '#ff6b6b', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>🛠 DEBUG TOOLS</div>
        <button id="btn-fusion-drop" className="hud-btn hud-btn-amber" onClick={onRequestFusionDrop}>
          {t.dropFusion}
        </button>
        <button id="btn-live-token" className="hud-btn hud-btn-blue" onClick={onRequestLiveEphemeralToken}>
          {t.issueLiveToken}
        </button>
        <button id="btn-interaction-turn" className="hud-btn hud-btn-steel" onClick={onRequestInteractionTurn}>
          {t.testInteraction}
        </button>
      </div>
    )}

    {showBattleHud && !isProfileOpen && (
      <button
        id="btn-cast-special"
        className={`hud-btn hud-cast-btn ${debugVisible ? 'has-chip' : ''} ${(isStreaming || isMatchPaused || !battleState.specialReady || !matchAlignmentReady) ? 'is-disabled' : ''}`}
        disabled={isStreaming || isMatchPaused || !battleState.specialReady || !matchAlignmentReady}
        onClick={onHandleCastSpecial}
      >
        {isMatchPaused
          ? t.matchPaused
          : (!matchAlignmentReady
            ? t.alignPending
            : (isStreaming ? t.casting : (battleState.specialReady ? t.castSpecial : `EX ${battleState.exGauge}/${EX_GAUGE.MAX}`)))}
      </button>
    )}

    {debugVisible && showBattleHud && !isProfileOpen && (
      <button
        id="btn-p2p-media"
        className={`hud-btn hud-chip-btn ${isP2PMediaOn ? 'is-on' : 'is-off'}`}
        onClick={onToggleP2PMedia}
      >
        {isP2PMediaOn ? t.p2pOn : t.p2pOff}
      </button>
    )}
  </>
);
