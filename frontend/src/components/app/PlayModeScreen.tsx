import type { FC } from 'react';
import { MatchModeScreen } from './MatchModeScreen';
import { ModeQuickDock } from './ModeQuickDock';
import { TrainingModeScreen } from './TrainingModeScreen';
import { WalkModeScreen } from './WalkModeScreen';
import type { BattleUiState, FusionCraftFlowState, ModeSession, UiText } from '../../types/app';
import type { PlayMode } from '../../store/useFSMStore';

type PlayModeScreenProps = {
  t: UiText;
  playMode: PlayMode;
  walkSession: ModeSession | null;
  trainingSession: ModeSession | null;
  specialPhrase: string;
  battleState: BattleUiState;
  showBattleHud: boolean;
  alignmentReady: boolean;
  isProfileOpen: boolean;
  showFusionCraft: boolean;
  fusionCraftFlow: FusionCraftFlowState;
  onOpenFusionCraft: () => void;
  onCloseFusionCraft: () => void;
  onSubmitFusionCraft: (payload: { requestId: string; concept: string; referenceImage: string }) => void;
  onCompleteWalk: () => void;
  onSendWalkVisionTrigger: () => void;
  onStartTraining: () => void;
  onCompleteTraining: () => void;
  onHandleCastSpecial: () => void;
  onOpenBattlePrep: () => void;
  onReturnToHub: () => void;
};

export const PlayModeScreen: FC<PlayModeScreenProps> = ({
  t,
  playMode,
  walkSession,
  trainingSession,
  specialPhrase,
  battleState,
  showBattleHud,
  alignmentReady,
  isProfileOpen,
  showFusionCraft,
  fusionCraftFlow,
  onOpenFusionCraft,
  onCloseFusionCraft,
  onSubmitFusionCraft,
  onCompleteWalk,
  onSendWalkVisionTrigger,
  onStartTraining,
  onCompleteTraining,
  onHandleCastSpecial,
  onOpenBattlePrep,
  onReturnToHub,
}) => {
  if (playMode === 'walk') {
    return (
      <>
        <ModeQuickDock
          t={t}
          playMode={playMode}
          walkSession={walkSession}
          trainingSession={trainingSession}
          battleState={battleState}
          onOpenFusionCraft={onOpenFusionCraft}
          onSendWalkVisionTrigger={onSendWalkVisionTrigger}
          onCompleteWalk={onCompleteWalk}
          onStartTraining={onStartTraining}
          onCompleteTraining={onCompleteTraining}
          onHandleCastSpecial={onHandleCastSpecial}
        />
        <WalkModeScreen
          t={t}
          walkSession={walkSession}
          isMenuOpen={isProfileOpen}
          showFusionCraft={showFusionCraft}
          fusionCraftFlow={fusionCraftFlow}
          onOpenFusionCraft={onOpenFusionCraft}
          onCloseFusionCraft={onCloseFusionCraft}
          onSubmitFusionCraft={onSubmitFusionCraft}
          onCompleteWalk={onCompleteWalk}
          onSendWalkVisionTrigger={onSendWalkVisionTrigger}
          onReturnToHub={onReturnToHub}
        />
      </>
    );
  }

  if (playMode === 'training') {
    return (
      <>
        <ModeQuickDock
          t={t}
          playMode={playMode}
          walkSession={walkSession}
          trainingSession={trainingSession}
          battleState={battleState}
          onOpenFusionCraft={onOpenFusionCraft}
          onSendWalkVisionTrigger={onSendWalkVisionTrigger}
          onCompleteWalk={onCompleteWalk}
          onStartTraining={onStartTraining}
          onCompleteTraining={onCompleteTraining}
          onHandleCastSpecial={onHandleCastSpecial}
        />
        <TrainingModeScreen
          t={t}
          trainingSession={trainingSession}
          specialPhrase={specialPhrase}
          battleState={battleState}
          isMenuOpen={isProfileOpen}
          onHandleCastSpecial={onHandleCastSpecial}
          onStartTraining={onStartTraining}
          onCompleteTraining={onCompleteTraining}
        />
      </>
    );
  }

  if (showBattleHud) {
    return (
      <MatchModeScreen
        t={t}
        battleState={battleState}
        alignmentReady={alignmentReady}
        isMenuOpen={isProfileOpen}
        onHandleCastSpecial={onHandleCastSpecial}
        onOpenBattlePrep={onOpenBattlePrep}
      />
    );
  }

  return null;
};
