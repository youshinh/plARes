import { useEffect, useState, type FC } from 'react';
import { canonicalizeLocale, inferLocaleLabel, type LanguagePreset } from '../../i18n/runtime';
import type { BattleUiState, LiveDebugInfo, ModeSession, ProfileInfo, UiText } from '../../types/app';
import type { PlayMode } from '../../store/useFSMStore';
import { buildReadableMemoryView } from '../../utils/memorySummary';

const describeTone = (tone: string, t: UiText) => {
  const normalized = tone.trim().toLowerCase();
  if (normalized === 'balanced') return t.toneBalanced ?? 'Balanced';
  if (normalized === 'aggressive') return t.toneAggressive ?? 'Aggressive';
  if (normalized === 'cool') return t.toneCool ?? 'Cool';
  if (normalized === 'fun') return t.toneFun ?? 'Playful';
  if (normalized === 'focused') return t.toneFocused ?? 'Focused';
  if (normalized === 'distrustful') return t.toneDistrustful ?? 'Distrustful';
  return tone;
};

const describeArStatus = (isARSessionActive: boolean, scanState: string, scanPointCount: number, t: UiText) => {
  if (!isARSessionActive) return t.arStatusOff ?? 'Standard View';
  if (scanState === 'ready') return `${t.arStatusReady ?? 'Surface Ready'} (${scanPointCount})`;
  if (scanState === 'tracking') return `${t.arStatusTracking ?? 'Tracking'} (${scanPointCount})`;
  if (scanState === 'searching') return t.arStatusSearching ?? 'Scanning Surface';
  return scanState;
};

const describeHeat = (heatActive: boolean, t: UiText) =>
  heatActive ? (t.heatOn ?? 'Active') : (t.heatOff ?? 'Normal');

const describeRecentMatch = (
  log: ProfileInfo['recentLogs'][number],
  t: UiText,
) => {
  const resultLabel =
    log.result === 'WIN' ? (t.matchResultWin ?? 'Win')
      : log.result === 'LOSE' ? (t.matchResultLose ?? 'Lose')
        : (t.matchResultDraw ?? 'Draw');
  return `${resultLabel} / ${t.memoryCriticalLabel} ${log.criticalHits} / ${t.memoryMissLabel} ${log.misses}`;
};

const formatLiveRoute = (route: string) => {
  const routeLabels: Record<string, string> = {
    browser_direct: 'Browser Direct',
    backend_interaction: 'Backend Interaction',
    audio_ws: 'Audio WS',
    adk_live_ws: 'ADK Live WS',
    game_event_ws: 'Game Event WS',
  };
  return route
    .split('->')
    .map((part) => routeLabels[part.trim()] ?? part.trim())
    .join(' -> ');
};

const formatAdkStatus = (status: string, t: UiText) => {
  if (!status.trim()) return t.liveUnavailable ?? 'Unavailable';
  if (status === 'pending') return t.livePending ?? 'Checking';
  if (status === 'available') return t.liveAvailable ?? 'Available';
  if (status.startsWith('unavailable')) return t.liveUnavailable ?? 'Unavailable';
  return status;
};

type ProfilePanelProps = {
  t: UiText;
  alignmentReady: boolean;
  languagePresets: LanguagePreset[];
  selectedLanguage: string;
  onChangeLanguage: (nextLanguage: string) => void;
  onRequestProfileSync: () => void;
  isLiveConnected: boolean;
  isLiveMicActive: boolean;
  liveActionDisabled: boolean;
  onToggleLiveConnection: () => void;
  onToggleLiveMic: () => void;
  onSendLiveTextPing: () => void;
  playMode: PlayMode;
  onReturnToHub: () => void;
  onOpenBattlePrep: () => void;
  onStartTraining: () => void;
  onCompleteTraining: () => void;
  trainingSession: ModeSession | null;
  onStartWalk: () => void;
  onCompleteWalk: () => void;
  walkSession: ModeSession | null;
  onOpenFusionCraft: () => void;
  onSendWalkVisionTrigger: () => void;
  onWalkVisionOrProfileSync: () => void;
  modeLabel: string;
  isARSessionActive: boolean;
  scanState: string;
  scanPointCount: number;
  profileView: ProfileInfo;
  battleState: BattleUiState;
  debugVisible: boolean;
  liveDebugInfo: LiveDebugInfo;
  bgmUrl: string;
  isProfileOpen: boolean;
  onToggleProfile: () => void;
};

export const ProfilePanel: FC<ProfilePanelProps> = ({
  t,
  alignmentReady,
  languagePresets,
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
  onOpenFusionCraft,
  onSendWalkVisionTrigger,
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
}) => {
  const [languageDraft, setLanguageDraft] = useState(selectedLanguage);
  const [matchTab, setMatchTab] = useState<'quick' | 'settings'>('quick');
  const compactMatchMenu = playMode === 'match';
  const memoryView = buildReadableMemoryView(profileView.memorySummary, t);
  const toneLabel = describeTone(profileView.tone, t);
  const arLabel = describeArStatus(isARSessionActive, scanState, scanPointCount, t);
  const heatLabel = describeHeat(battleState.heatActive, t);
  const adkStatusLabel = formatAdkStatus(liveDebugInfo.adkStatus, t);

  useEffect(() => {
    setLanguageDraft(selectedLanguage);
  }, [selectedLanguage]);

  useEffect(() => {
    if (!compactMatchMenu) {
      setMatchTab('quick');
    }
  }, [compactMatchMenu]);

  const applyDraftLanguage = () => {
    onChangeLanguage(canonicalizeLocale(languageDraft, selectedLanguage));
  };
  const languageLocked = playMode === 'match';

  return (
    <aside className={`hud-profile hud-animate ${isProfileOpen ? 'is-open' : ''} ${compactMatchMenu ? 'is-match-mode' : ''}`}>
      <datalist id="hud-language-presets">
        {languagePresets.map(option => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </datalist>
      <div className="hud-profile-head">
        <button
          type="button"
          className="hud-profile-title"
          onClick={onToggleProfile}
        >
          {compactMatchMenu ? t.menu : t.pilotTelemetry}
        </button>
        <button
          type="button"
          className="hud-profile-close"
          onClick={onToggleProfile}
          aria-label={t.closeMenu ?? 'Close menu'}
        >
          {t.closeMenu ?? 'Close'}
        </button>
      </div>
      {compactMatchMenu && (
        <div className="hud-menu-tabs">
          <button
            className={`hud-menu-tab ${matchTab === 'quick' ? 'is-active' : ''}`}
            onClick={() => setMatchTab('quick')}
          >
            {t.quickActions}
          </button>
          <button
            className={`hud-menu-tab ${matchTab === 'settings' ? 'is-active' : ''}`}
            onClick={() => setMatchTab('settings')}
          >
            {t.settingsTitle}
          </button>
        </div>
      )}
      {(!compactMatchMenu || matchTab === 'settings') && (
        <>
          <div className="hud-section-label">{t.settingsTitle}</div>
          <div className="hud-profile-actions">
            <div className={`hud-align-pill ${alignmentReady ? 'is-ready' : ''}`}>
              {alignmentReady ? t.alignReady : t.alignPending}
            </div>
            <label className="hud-lang-wrap hud-lang-editor">
              <span>{t.language}</span>
              <div className="hud-lang-editor-row">
                <input
                  className="hud-lang-input"
                  list="hud-language-presets"
                  value={languageDraft}
                  onChange={(event) => setLanguageDraft(event.target.value)}
                  placeholder="e.g. fr-FR"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={languageLocked}
                />
                <button
                  className="hud-btn hud-btn-mini hud-btn-steel"
                  onClick={applyDraftLanguage}
                  disabled={languageLocked}
                  title={languageLocked ? t.languageChangeAfterMatch : ''}
                >
                  {t.applyLanguage}
                </button>
              </div>
              <div className="hud-lang-hint">{inferLocaleLabel(selectedLanguage)}</div>
              <div className="hud-lang-hint">
                {languageLocked ? t.languageChangeAfterMatch : t.languageSettingHint}
              </div>
            </label>
            {(liveDebugInfo.lastStatus || liveDebugInfo.degradedReason) && (
              <div className="hud-lang-hint">
                {liveDebugInfo.degradedReason
                  ? `Live status: ${liveDebugInfo.lastStatus || 'degraded'} / ${liveDebugInfo.degradedReason}`
                  : `Live status: ${liveDebugInfo.lastStatus}`}
              </div>
            )}
            <div className="hud-live-status-card">
              <div className="hud-live-status-head">
                <span>{t.liveRoutingTitle ?? 'Live Routing'}</span>
                <strong>{adkStatusLabel}</strong>
              </div>
              <div className="hud-live-status-grid">
                <span>{t.liveConversationRoute ?? 'Conversation'}</span>
                <strong>{formatLiveRoute(liveDebugInfo.conversationRoute)}</strong>
                <span>{t.liveBattleRoute ?? 'Battle Coach'}</span>
                <strong>{formatLiveRoute(liveDebugInfo.battleCoachingRoute)}</strong>
                <span>{t.liveCommentaryRoute ?? 'Commentary'}</span>
                <strong>{formatLiveRoute(liveDebugInfo.commentaryRoute)}</strong>
                <span>{t.liveVisionRoute ?? 'Vision Trigger'}</span>
                <strong>{formatLiveRoute(liveDebugInfo.visionTriggerRoute)}</strong>
                <span>{t.liveAdkStatus ?? 'ADK Live'}</span>
                <strong>{adkStatusLabel}</strong>
                {liveDebugInfo.lastStatus ? (
                  <>
                    <span>{t.liveStatusLabel ?? 'Status'}</span>
                    <strong>{liveDebugInfo.lastStatus}</strong>
                  </>
                ) : null}
                {liveDebugInfo.degradedReason ? (
                  <>
                    <span>{t.liveDegradedReason ?? 'Reason'}</span>
                    <strong>{liveDebugInfo.degradedReason}</strong>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}
      {(!compactMatchMenu || matchTab === 'quick') && (
        <>
          <div className="hud-section-label">{compactMatchMenu ? t.quickActions : t.mode}</div>
          <div className="hud-main-commands">
            <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={onRequestProfileSync}>
              {t.refreshMemory}
            </button>
            <button
              className={`hud-btn hud-btn-mini ${playMode === 'hub' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
              onClick={onReturnToHub}
            >
              {t.modeHub}
            </button>
            <button
              className={`hud-btn hud-btn-mini ${playMode === 'match' ? 'hud-btn-blue' : 'hud-btn-carbon'}`}
              onClick={playMode === 'match' ? onOpenBattlePrep : onOpenBattlePrep}
            >
              {t.prepTitle}
            </button>
            <button
              className={`hud-btn hud-btn-mini ${playMode === 'match' ? 'hud-btn-warn' : 'hud-btn-carbon'}`}
              onClick={playMode === 'match' ? onReturnToHub : onOpenBattlePrep}
            >
              {playMode === 'match' ? t.flowReturnHub : t.flowStartBattle}
            </button>
            {!compactMatchMenu && (
              <>
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
                {playMode === 'walk' && (
                  <>
                    <button
                      className="hud-btn hud-btn-mini hud-btn-teal"
                      onClick={onOpenFusionCraft}
                    >
                      {t.fusionLaunch}
                    </button>
                    <button
                      className="hud-btn hud-btn-mini hud-btn-carbon"
                      onClick={onSendWalkVisionTrigger}
                    >
                      {t.sendWalkVision}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
      {debugVisible && (!compactMatchMenu || matchTab === 'settings') && (
        <>
          <div className="hud-section-label">{t.debugSection}</div>
          <div className="hud-main-commands">
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
            <button
              className="hud-btn hud-btn-steel hud-btn-mini"
              onClick={onWalkVisionOrProfileSync}
            >
              {playMode === 'walk' ? t.sendWalkVision : t.refreshMemory}
            </button>
          </div>
        </>
      )}
      {!compactMatchMenu && (
        <>
          <div className="hud-profile-grid">
            <span>{t.mode}</span><strong>{modeLabel}</strong>
            <span>AR</span><strong>{arLabel}</strong>
            <span>{t.matches}</span><strong>{`${profileView.totalMatches} ${t.matchUnit ?? 'matches'}`}</strong>
            <span>{t.training}</span><strong>{`${profileView.totalTrainingSessions} ${t.sessionUnit ?? 'sessions'}`}</strong>
            <span>{t.walks}</span><strong>{`${profileView.totalWalkSessions} ${t.sessionUnit ?? 'sessions'}`}</strong>
            <span>{t.tone}</span><strong>{toneLabel}</strong>
            <span>{t.sync}</span><strong>{`${Math.round(profileView.syncRate * 100)}%`}</strong>
            <span>{t.heat}</span><strong>{heatLabel}</strong>
          </div>
          <div className="hud-memory-line" title={memoryView.headline}>
            {memoryView.headline}
          </div>
          {memoryView.entries.length > 1 && (
            <div className="hud-block">
              {memoryView.entries.slice(1).map((entry) => (
                <div key={entry} className="memory-summary-item">
                  {entry}
                </div>
              ))}
            </div>
          )}
          {profileView.recentLogs.length > 0 && (
            <div className="hud-block">
              {profileView.recentLogs.map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="hud-log-line">
                  {describeRecentMatch(log, t)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!compactMatchMenu && debugVisible && (
        liveDebugInfo.tokenName ||
        liveDebugInfo.interactionId ||
        liveDebugInfo.interactionText ||
        liveDebugInfo.lastStatus ||
        liveDebugInfo.degradedReason ||
        bgmUrl
      ) && (
        <div className="hud-block hud-dim" style={{ borderLeft: '2px solid #ff6b6b' }}>
          <div style={{ fontSize: '0.6rem', color: '#ff6b6b', fontWeight: 700, marginBottom: 2 }}>🛠 DEBUG INFO</div>
          <div className="hud-truncate">{`Conversation Route: ${liveDebugInfo.conversationRoute}`}</div>
          <div className="hud-truncate">{`Battle Coaching Route: ${liveDebugInfo.battleCoachingRoute}`}</div>
          <div className="hud-truncate">{`Commentary Route: ${liveDebugInfo.commentaryRoute}`}</div>
          <div className="hud-truncate">{`Vision Trigger Route: ${liveDebugInfo.visionTriggerRoute}`}</div>
          <div className="hud-truncate">{`ADK Live: ${liveDebugInfo.adkStatus}`}</div>
          {liveDebugInfo.lastStatus && <div className="hud-truncate">{`Live Status: ${liveDebugInfo.lastStatus}`}</div>}
          {liveDebugInfo.degradedReason && <div className="hud-truncate">{`Degraded: ${liveDebugInfo.degradedReason}`}</div>}
          {liveDebugInfo.tokenName && <div className="hud-truncate">{`Token: ${liveDebugInfo.tokenName}`}</div>}
          {liveDebugInfo.resumeHandle && <div className="hud-truncate">{`Resume: ${liveDebugInfo.resumeHandle}`}</div>}
          {liveDebugInfo.interactionId && <div className="hud-truncate">{`Interaction: ${liveDebugInfo.interactionId}`}</div>}
          {liveDebugInfo.interactionText && <div className="hud-truncate">{liveDebugInfo.interactionText}</div>}
          {bgmUrl && <div className="hud-truncate">{`BGM: ${bgmUrl}`}</div>}
        </div>
      )}
    </aside>
  );
};
