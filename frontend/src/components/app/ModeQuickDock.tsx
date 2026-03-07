import { useEffect, useState, type FC } from 'react';
import { EX_GAUGE } from '../../../../shared/constants/battleConstants';
import type { BattleUiState, ModeSession, UiText } from '../../types/app';
import type { PlayMode } from '../../store/useFSMStore';

type ModeQuickDockProps = {
  t: UiText;
  playMode: PlayMode;
  walkSession: ModeSession | null;
  trainingSession: ModeSession | null;
  battleState: BattleUiState;
  onOpenFusionCraft: () => void;
  onSendWalkVisionTrigger: () => void;
  onCompleteWalk: () => void;
  onStartTraining: () => void;
  onCompleteTraining: () => void;
  onHandleCastSpecial: () => void;
};

export const ModeQuickDock: FC<ModeQuickDockProps> = ({
  t,
  playMode,
  walkSession,
  trainingSession,
  battleState,
  onOpenFusionCraft,
  onSendWalkVisionTrigger,
  onCompleteWalk,
  onStartTraining,
  onCompleteTraining,
  onHandleCastSpecial,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(false);
  }, [playMode]);

  if (playMode !== 'walk' && playMode !== 'training') {
    return null;
  }

  return (
    <aside className={`mode-quick-dock hud-animate ${collapsed ? 'is-collapsed' : ''} is-${playMode}`}>
      <button
        type="button"
        className="mode-quick-dock-toggle"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-label={collapsed ? t.quickActions : (t.closeMenu ?? 'Close')}
      >
        {collapsed ? '+' : '-'}
      </button>
      {!collapsed && (
        <div className="mode-quick-dock-body">
          <div className="mode-quick-dock-label">
            {playMode === 'walk' ? t.modeWalk : t.modeTraining}
          </div>
          <div className="mode-quick-dock-actions">
            {playMode === 'walk' ? (
              <>
                <button className="hud-btn hud-btn-mini hud-btn-teal" onClick={onOpenFusionCraft}>
                  {t.fusionLaunch}
                </button>
                <button className="hud-btn hud-btn-mini hud-btn-carbon" onClick={onSendWalkVisionTrigger}>
                  {t.sendWalkVision}
                </button>
                <button className="hud-btn hud-btn-mini hud-btn-blue" onClick={onCompleteWalk} disabled={!walkSession}>
                  {t.completeWalk}
                </button>
              </>
            ) : (
              <>
                <button
                  className={`hud-btn hud-btn-mini hud-btn-warn ${!battleState.specialReady ? 'is-disabled' : ''}`}
                  onClick={onHandleCastSpecial}
                  disabled={!battleState.specialReady}
                >
                  {battleState.specialReady ? t.castSpecial : `${t.exGaugeLabel} ${battleState.exGauge}/${EX_GAUGE.MAX}`}
                </button>
                <button
                  className="hud-btn hud-btn-mini hud-btn-blue"
                  onClick={trainingSession ? onCompleteTraining : onStartTraining}
                >
                  {trainingSession ? t.completeTraining : t.startTraining}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
