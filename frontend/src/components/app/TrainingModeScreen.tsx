import type { FC } from 'react';
import { EX_GAUGE } from '../../../../shared/constants/battleConstants';
import type { BattleUiState, ModeSession, UiText } from '../../types/app';

type TrainingModeScreenProps = {
  t: UiText;
  trainingSession: ModeSession | null;
  specialPhrase: string;
  battleState: BattleUiState;
  isMenuOpen: boolean;
  onHandleCastSpecial: () => void;
  onStartTraining: () => void;
  onCompleteTraining: () => void;
};

export const TrainingModeScreen: FC<TrainingModeScreenProps> = ({
  t,
  trainingSession,
  specialPhrase,
  battleState,
  isMenuOpen,
  onHandleCastSpecial,
  onStartTraining,
  onCompleteTraining,
}) => {
  const sessionActive = Boolean(trainingSession);
  const specialReady = battleState.specialReady;
  const readableSpecialPhrase = specialPhrase.replace(/^undefined\s+/i, '').trim();

  return (
    <section className={`play-mode-screen hud-animate is-training ${isMenuOpen ? 'is-obscured' : ''}`} aria-label={t.modeTraining}>
      <div className="play-mode-panel">
        <div className="play-mode-eyebrow">{t.modeTraining}</div>
        <h2>{t.trainingFocusTitle}</h2>
        <p>{t.trainingFocusDesc}</p>
        {sessionActive && readableSpecialPhrase && (
          <div className="play-mode-banner is-twist">{`${t.twistTitle} ${readableSpecialPhrase}`}</div>
        )}
        <div className="play-mode-meta">
          <div className={`play-mode-chip ${sessionActive ? 'is-active' : ''}`}>
            {sessionActive ? t.routeStatusDoing : t.routeStatusTodo}
          </div>
          <div className={`play-mode-chip ${specialReady ? 'is-success' : ''}`}>
            {specialReady ? t.castSpecial : `${t.exGaugeLabel} ${battleState.exGauge}/${EX_GAUGE.MAX}`}
          </div>
        </div>
        <div className="play-mode-actions">
          <button
            className={`hud-btn hud-btn-warn ${!specialReady ? 'is-disabled' : ''}`}
            onClick={onHandleCastSpecial}
            disabled={!specialReady}
          >
            {specialReady ? t.incantationStart : `${t.exGaugeLabel} ${battleState.exGauge}/${EX_GAUGE.MAX}`}
          </button>
          <button className="hud-btn hud-btn-blue" onClick={sessionActive ? onCompleteTraining : onStartTraining}>
            {sessionActive ? t.completeTraining : t.startTraining}
          </button>
        </div>
      </div>
    </section>
  );
};
