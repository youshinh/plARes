import type { FC } from 'react';
import { FusionCraftScreen } from './FusionCraftScreen';
import type { FusionCraftFlowState, ModeSession, UiText } from '../../types/app';
import type { MountPointId } from '../robot/constants';

type WalkModeScreenProps = {
  t: UiText;
  walkSession: ModeSession | null;
  isARSessionActive: boolean;
  isMenuOpen: boolean;
  showFusionCraft: boolean;
  fusionCraftFlow: FusionCraftFlowState;
  onOpenFusionCraft: () => void;
  onCloseFusionCraft: () => void;
  onSubmitFusionCraft: (payload: {
    requestId: string;
    concept: string;
    referenceImage: string;
    craftKind: 'skin' | 'attachment';
    mountPoint: MountPointId;
  }) => void;
  onCompleteWalk: () => void;
  onSendWalkVisionTrigger: () => void;
  onReturnToHub: () => void;
};

export const WalkModeScreen: FC<WalkModeScreenProps> = ({
  t,
  walkSession,
  isARSessionActive,
  isMenuOpen,
  showFusionCraft,
  fusionCraftFlow,
  onOpenFusionCraft,
  onCloseFusionCraft,
  onSubmitFusionCraft,
  onCompleteWalk,
  onSendWalkVisionTrigger,
  onReturnToHub,
}) => {
  const sessionActive = Boolean(walkSession);
  const fusionReady = fusionCraftFlow.status === 'success' && Boolean(fusionCraftFlow.textureUrl);

  if (showFusionCraft) {
    return (
      <FusionCraftScreen
        t={t}
        flow={fusionCraftFlow}
        isARSessionActive={isARSessionActive}
        onBack={onCloseFusionCraft}
        onSubmitFusionCraft={onSubmitFusionCraft}
      />
    );
  }

  return (
    <section className={`play-mode-screen hud-animate is-walk ${isMenuOpen ? 'is-obscured' : ''}`} aria-label={t.modeWalk}>
      <div className="play-mode-panel">
        <div className="play-mode-eyebrow">{t.modeWalk}</div>
        <h2>{t.walkFocusTitle}</h2>
        <p>{t.walkFocusDesc}</p>
        <div className="play-mode-meta">
          <div className={`play-mode-chip ${sessionActive ? 'is-active' : ''}`}>
            {sessionActive ? t.routeStatusDoing : t.routeStatusTodo}
          </div>
          <div className={`play-mode-chip ${fusionReady ? 'is-success' : ''}`}>
            {fusionReady ? t.fusionSuccess : t.fusionHint}
          </div>
        </div>
        {fusionCraftFlow.message && (
          <div className={`play-mode-banner ${fusionCraftFlow.status === 'error' ? 'is-error' : ''}`}>
            {fusionCraftFlow.message}
          </div>
        )}
        <div className="play-mode-actions">
          <button className="hud-btn hud-btn-teal" onClick={onOpenFusionCraft}>
            {t.fusionLaunch}
          </button>
          <button className="hud-btn hud-btn-carbon" onClick={onSendWalkVisionTrigger}>
            {t.sendWalkVision}
          </button>
          <button className="hud-btn hud-btn-blue" onClick={sessionActive ? onCompleteWalk : onReturnToHub}>
            {sessionActive ? t.completeWalk : t.flowReturnHub}
          </button>
        </div>
      </div>
    </section>
  );
};
