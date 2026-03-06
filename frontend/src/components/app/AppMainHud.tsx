import React from 'react';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { EX_GAUGE } from '../../../../shared/constants/battleConstants';
import { CharacterLabPanel } from '../ui/CharacterLabPanel';
import { FusionCraftModal } from '../ui/FusionCraftModal';
import type {
  BattleUiState,
  DnaAbFeedbackPayload,
  LiveDebugInfo,
  ModeSession,
  ProfileInfo,
  UiText,
} from '../../types/app';
import type { PlayMode } from '../../store/useFSMStore';

type RouteStatus = 'todo' | 'doing' | 'done';
type RouteStepKey = 'walk' | 'training' | 'match';

type AppMainHudProps = {
  t: UiText;
  characterLabEnabled: boolean;
  currentModelType: 'A' | 'B';
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
  onRequestProfileSync: () => void;
  onToggleLiveConnection: () => void;
  onToggleLiveMic: () => void;
  onSendLiveTextPing: () => void;
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

type FlowHubSectionProps = Pick<
  AppMainHudProps,
  't' |
  'profileView' |
  'routeNextStep' |
  'routeSteps' |
  'onTriggerRecommendedRouteStep' |
  'onStartWalk' |
  'onStartTraining' |
  'onOpenBattlePrep' |
  'onRequestProfileSync'
> & {
  onOpenProfile: () => void;
};

const routeStatusLabel = (t: UiText, status: RouteStatus) => (
  status === 'done' ? t.routeStatusDone :
  status === 'doing' ? t.routeStatusDoing :
  t.routeStatusTodo
);

const nextRouteLabel = (t: UiText, routeNextStep: RouteStepKey | 'complete') => {
  if (routeNextStep === 'complete') return t.routeCtaComplete;
  return `${t.routeCtaNext}: ${routeNextStep === 'walk'
    ? t.startWalk
    : routeNextStep === 'training'
      ? t.startTraining
      : t.flowStartBattle}`;
};

const FlowHubSection: React.FC<FlowHubSectionProps> = ({
  t,
  profileView,
  routeNextStep,
  routeSteps,
  onTriggerRecommendedRouteStep,
  onStartWalk,
  onStartTraining,
  onOpenBattlePrep,
  onRequestProfileSync,
  onOpenProfile,
}) => (
  <section className="flow-hub hud-animate" aria-label={t.flowHubTitle}>
    <div className="flow-hub-header">
      <h2>{t.flowHubTitle}</h2>
      <p>{t.flowHubDesc}</p>
      <div className="flow-hub-pill">{t.flowPhase1Done}</div>
    </div>
    <div className="flow-route-guide">
      <div className="flow-route-title">{t.routeGuideTitle}</div>
      <p className="flow-route-desc">{t.routeGuideDesc}</p>
      <ol className="flow-route-list">
        {routeSteps.map(step => (
          <li key={step.key} className={`flow-route-item is-${step.status}`}>
            <span className="flow-route-step">{step.label}</span>
            <span className={`flow-route-badge is-${step.status}`}>{routeStatusLabel(t, step.status)}</span>
          </li>
        ))}
      </ol>
      <button
        className="hud-btn hud-btn-blue hud-btn-mini"
        onClick={onTriggerRecommendedRouteStep}
        disabled={routeNextStep === 'complete'}
      >
        {nextRouteLabel(t, routeNextStep)}
      </button>
    </div>
    <div className="flow-hub-grid">
      <article className="flow-hub-card">
        <h3>{t.flowPhase2Title}</h3>
        <p>{t.flowPhase2Desc}</p>
        <div className="flow-hub-actions">
          <button className="hud-btn hud-btn-teal hud-btn-mini" onClick={onStartWalk}>
            {t.startWalk}
          </button>
          <button className="hud-btn hud-btn-blue hud-btn-mini" onClick={onStartTraining}>
            {t.startTraining}
          </button>
        </div>
      </article>
      <article className="flow-hub-card">
        <h3>{t.flowPhase3Title}</h3>
        <p>{t.flowPhase3Desc}</p>
        <div className="flow-hub-actions">
          <button className="hud-btn hud-btn-warn hud-btn-mini" onClick={onOpenBattlePrep}>
            {t.flowStartBattle}
          </button>
        </div>
      </article>
      <article className="flow-hub-card">
        <h3>{t.flowPhase4Title}</h3>
        <p>{t.flowPhase4Desc}</p>
        <div className="flow-hub-memory" title={profileView.memorySummary || ''}>
          {profileView.memorySummary || t.noMemory}
        </div>
        <div className="flow-hub-actions">
          <button
            className="hud-btn hud-btn-carbon hud-btn-mini"
            onClick={() => {
              onRequestProfileSync();
              onOpenProfile();
            }}
          >
            {t.flowOpenMemory}
          </button>
        </div>
      </article>
    </div>
  </section>
);

type BattlePrepProps = Pick<
  AppMainHudProps,
  't' |
  'hasRouteFoundation' |
  'currentModelType' |
  'alignmentReady' |
  'hasWalkMilestone' |
  'hasTrainingMilestone' |
  'onStartWalk' |
  'onStartTraining' |
  'onEnterBattleMode' |
  'onCloseBattlePrep'
>;

const BattlePrepOverlay: React.FC<BattlePrepProps> = ({
  t,
  hasRouteFoundation,
  currentModelType,
  alignmentReady,
  hasWalkMilestone,
  hasTrainingMilestone,
  onStartWalk,
  onStartTraining,
  onEnterBattleMode,
  onCloseBattlePrep,
}) => (
  <section className="battle-prep-overlay hud-animate" aria-label={t.prepTitle}>
    <div className="battle-prep-card">
      <h2>{t.prepTitle}</h2>
      <p>{t.prepDesc}</p>
      <ol className="battle-prep-list">
        <li className={`battle-prep-item ${hasRouteFoundation ? 'is-ready' : 'is-missing'}`}>
          <span>{t.prepStepRoute}</span>
          <strong>{hasRouteFoundation ? t.prepReady : t.prepMissing}</strong>
        </li>
        <li className="battle-prep-item is-ready">
          <span>{t.prepStepModel}</span>
          <strong>{`Type ${currentModelType}`}</strong>
        </li>
        <li className={`battle-prep-item ${alignmentReady ? 'is-ready' : 'is-guide'}`}>
          <span>{t.prepStepAlign}</span>
          <strong>{alignmentReady ? t.prepReady : t.prepAlignGuide}</strong>
        </li>
      </ol>
      <div className="battle-prep-actions">
        {!hasWalkMilestone && (
          <button className="hud-btn hud-btn-teal hud-btn-mini" onClick={onStartWalk}>
            {t.prepGoWalk}
          </button>
        )}
        {!hasTrainingMilestone && (
          <button className="hud-btn hud-btn-blue hud-btn-mini" onClick={onStartTraining}>
            {t.prepGoTraining}
          </button>
        )}
        <button className="hud-btn hud-btn-warn hud-btn-mini" onClick={onEnterBattleMode}>
          {t.prepStartNow}
        </button>
        <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={onCloseBattlePrep}>
          {t.prepBackHub}
        </button>
      </div>
    </div>
  </section>
);

type ProfilePanelProps = Pick<
  AppMainHudProps,
  't' |
  'alignmentReady' |
  'selectedLanguage' |
  'onChangeLanguage' |
  'onRequestProfileSync' |
  'isLiveConnected' |
  'isLiveMicActive' |
  'liveActionDisabled' |
  'onToggleLiveConnection' |
  'onToggleLiveMic' |
  'onSendLiveTextPing' |
  'playMode' |
  'onReturnToHub' |
  'onOpenBattlePrep' |
  'onStartTraining' |
  'onCompleteTraining' |
  'trainingSession' |
  'onStartWalk' |
  'onCompleteWalk' |
  'walkSession' |
  'onWalkVisionOrProfileSync' |
  'modeLabel' |
  'isARSessionActive' |
  'scanState' |
  'scanPointCount' |
  'profileView' |
  'battleState' |
  'debugVisible' |
  'liveDebugInfo' |
  'bgmUrl' |
  'isProfileOpen' |
  'onToggleProfile'
>;

const ProfilePanel: React.FC<ProfilePanelProps> = ({
  t,
  alignmentReady,
  selectedLanguage,
  onChangeLanguage,
  onRequestProfileSync,
  isLiveConnected,
  isLiveMicActive,
  liveActionDisabled,
  onToggleLiveConnection,
  onToggleLiveMic,
  onSendLiveTextPing,
  playMode,
  onReturnToHub,
  onOpenBattlePrep,
  onStartTraining,
  onCompleteTraining,
  trainingSession,
  onStartWalk,
  onCompleteWalk,
  walkSession,
  onWalkVisionOrProfileSync,
  modeLabel,
  isARSessionActive,
  scanState,
  scanPointCount,
  profileView,
  battleState,
  debugVisible,
  liveDebugInfo,
  bgmUrl,
  isProfileOpen,
  onToggleProfile,
}) => (
  <aside className={`hud-profile hud-animate ${isProfileOpen ? 'is-open' : ''}`}>
    <div className="hud-profile-title" onClick={onToggleProfile}>
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
          onChange={(event) => onChangeLanguage(event.target.value)}
        >
          <option value="ja-JP">日本語</option>
          <option value="en-US">English</option>
          <option value="es-ES">Espanol</option>
        </select>
      </label>
    </div>
    <div className="hud-main-commands">
      <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={onRequestProfileSync}>
        {t.refreshMemory}
      </button>
      <button
        className={`hud-btn hud-btn-mini ${isLiveConnected ? 'hud-btn-green' : 'hud-btn-teal'}`}
        onClick={onToggleLiveConnection}
      >
        {isLiveConnected ? t.disconnectLive : t.connectLive}
      </button>
      <button
        className={`hud-btn hud-btn-mini ${isLiveMicActive ? 'hud-btn-warn' : 'hud-btn-blue'}`}
        onClick={onToggleLiveMic}
        disabled={liveActionDisabled}
        title={liveActionDisabled ? t.liveNeedConnection : ''}
      >
        {isLiveMicActive ? t.stopLiveMic : t.startLiveMic}
      </button>
      <button
        className="hud-btn hud-btn-carbon hud-btn-mini"
        onClick={onSendLiveTextPing}
        disabled={liveActionDisabled}
        title={liveActionDisabled ? t.liveNeedConnection : ''}
      >
        {t.sendLiveText}
      </button>
    </div>
    <div className="hud-main-commands">
      <button
        className={`hud-btn hud-btn-mini ${playMode === 'hub' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
        onClick={onReturnToHub}
      >
        {t.modeHub}
      </button>
      <button
        className={`hud-btn hud-btn-mini ${playMode === 'match' ? 'hud-btn-warn' : 'hud-btn-carbon'}`}
        onClick={playMode === 'match' ? onReturnToHub : onOpenBattlePrep}
      >
        {playMode === 'match' ? t.flowReturnHub : t.flowStartBattle}
      </button>
      <button
        className={`hud-btn hud-btn-mini ${playMode === 'training' ? 'hud-btn-teal' : 'hud-btn-carbon'}`}
        onClick={trainingSession ? onCompleteTraining : onStartTraining}
      >
        {trainingSession ? t.completeTraining : t.startTraining}
      </button>
      <button
        className={`hud-btn hud-btn-mini ${playMode === 'walk' ? 'hud-btn-teal' : 'hud-btn-carbon'}`}
        onClick={walkSession ? onCompleteWalk : onStartWalk}
      >
        {walkSession ? t.completeWalk : t.startWalk}
      </button>
      <button
        className="hud-btn hud-btn-steel hud-btn-mini"
        onClick={onWalkVisionOrProfileSync}
      >
        {playMode === 'walk' ? t.sendWalkVision : t.refreshMemory}
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
        {profileView.recentLogs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} className="hud-log-line">
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
);

export const AppMainHud: React.FC<AppMainHudProps> = ({
  t,
  characterLabEnabled,
  currentModelType,
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
  onRequestProfileSync,
  onToggleLiveConnection,
  onToggleLiveMic,
  onSendLiveTextPing,
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
    {playMode === 'walk' && (
      <div className="hud-training-actions">
        <button
          className="hud-btn-special"
          onClick={onOpenFusionCraft}
          style={{ background: 'linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%)' }}
        >
          Fusion Craft
        </button>
        <button className="hud-btn-special" onClick={onSendWalkVisionTrigger}>
          {t.sendWalkVision}
        </button>
      </div>
    )}
    {playMode === 'training' && trainingSession && specialPhrase && (
      <div className="hud-twist-telop">
        {t.twistTitle} {specialPhrase}
      </div>
    )}
    {playMode === 'training' && trainingSession && (
      <div className="hud-training-actions">
        <button
          className={`hud-btn hud-btn-special ${!battleState.specialReady ? 'is-disabled' : ''}`}
          onClick={onHandleCastSpecial}
          disabled={!battleState.specialReady}
        >
          {t.incantationStart}
        </button>
      </div>
    )}
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
    <header className="hud-top-left hud-animate">
      <div className="hud-brand">
        <div className="hud-brand-main">PLARES AR</div>
        <div className="hud-brand-sub">{t.brandSub}</div>
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
        {playMode === 'match' && (
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
            className="hud-btn hud-btn-teal hud-btn-mini"
            onClick={onOpenShare}
          >
            {t.share}
          </button>
        )}
        {characterLabEnabled && (
          <button
            id="btn-open-lab"
            className="hud-btn hud-btn-carbon hud-btn-mini"
            onClick={onOpenLab}
          >
            Lab
          </button>
        )}
        <button
          id="btn-debug-toggle"
          className={`hud-btn hud-btn-mini ${debugVisible ? 'hud-btn-warn' : 'hud-btn-carbon'}`}
          onClick={onToggleDebug}
          title="Toggle debug panels"
        >
          {debugVisible ? '🛠 DEBUG ON' : '🛠 DEBUG'}
        </button>
      </div>
    </header>
    {isHubMode && (
      <FlowHubSection
        t={t}
        profileView={profileView}
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
        currentModelType={currentModelType}
        alignmentReady={alignmentReady}
        hasWalkMilestone={hasWalkMilestone}
        hasTrainingMilestone={hasTrainingMilestone}
        onStartWalk={onStartWalk}
        onStartTraining={onStartTraining}
        onEnterBattleMode={onEnterBattleMode}
        onCloseBattlePrep={onCloseBattlePrep}
      />
    )}
    <FusionCraftModal
      isOpen={showFusionCraft}
      onClose={onCloseFusionCraft}
    />
    {showBattleHud && (
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
    )}
    <ProfilePanel
      t={t}
      alignmentReady={alignmentReady}
      selectedLanguage={selectedLanguage}
      onChangeLanguage={onChangeLanguage}
      onRequestProfileSync={onRequestProfileSync}
      isLiveConnected={isLiveConnected}
      isLiveMicActive={isLiveMicActive}
      liveActionDisabled={liveActionDisabled}
      onToggleLiveConnection={onToggleLiveConnection}
      onToggleLiveMic={onToggleLiveMic}
      onSendLiveTextPing={onSendLiveTextPing}
      playMode={playMode}
      onReturnToHub={onReturnToHub}
      onOpenBattlePrep={onOpenBattlePrep}
      onStartTraining={onStartTraining}
      onCompleteTraining={onCompleteTraining}
      trainingSession={trainingSession}
      onStartWalk={onStartWalk}
      onCompleteWalk={onCompleteWalk}
      walkSession={walkSession}
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
    {showBattleHud && (
      <button
        id="btn-cast-special"
        className={`hud-btn hud-cast-btn ${(isStreaming || isMatchPaused || !battleState.specialReady || !matchAlignmentReady) ? 'is-disabled' : ''}`}
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
    {debugVisible && showBattleHud && (
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
