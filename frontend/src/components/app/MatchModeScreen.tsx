import type { FC } from 'react';
import { EX_GAUGE } from '../../../../shared/constants/battleConstants';
import type { BattleUiState, UiText } from '../../types/app';

type MatchModeScreenProps = {
  t: UiText;
  battleState: BattleUiState;
  alignmentReady: boolean;
  isMenuOpen: boolean;
  onHandleCastSpecial: () => void;
  onOpenBattlePrep: () => void;
};

export const MatchModeScreen: FC<MatchModeScreenProps> = ({
  t,
  battleState,
  alignmentReady,
  isMenuOpen,
  onHandleCastSpecial,
  onOpenBattlePrep,
}) => {
  const specialReady = battleState.specialReady;

  if (isMenuOpen) {
    return null;
  }

  return (
    <section className="play-mode-screen hud-animate is-match" aria-label={t.modeMatch}>
      <div className="play-mode-panel match-hud-panel">
        <div className="play-mode-eyebrow">{t.modeMatch}</div>
        <h2>{t.matchFocusTitle}</h2>
        <p className="match-hud-copy">{t.matchFocusDesc}</p>
        <div className="play-mode-meta">
          <div className={`play-mode-chip ${alignmentReady ? 'is-success' : ''}`}>
            {alignmentReady ? t.alignReady : t.alignPending}
          </div>
          <div className={`play-mode-chip ${specialReady ? 'is-success' : ''}`}>
            {specialReady ? t.castSpecial : `${t.exGaugeLabel} ${battleState.exGauge}/${EX_GAUGE.MAX}`}
          </div>
        </div>
        {!alignmentReady && (
          <div className="play-mode-banner">{t.prepAlignGuide}</div>
        )}
        <div className="play-mode-actions">
          <button
            className={`hud-btn hud-btn-warn ${!specialReady ? 'is-disabled' : ''}`}
            onClick={onHandleCastSpecial}
            disabled={!specialReady}
          >
            {specialReady ? t.castSpecial : `${t.exGaugeLabel} ${battleState.exGauge}/${EX_GAUGE.MAX}`}
          </button>
          <button className="hud-btn hud-btn-carbon" onClick={onOpenBattlePrep}>
            {t.prepTitle}
          </button>
        </div>
      </div>
    </section>
  );
};
