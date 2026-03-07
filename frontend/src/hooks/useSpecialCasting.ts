import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { EX_GAUGE } from '../../../shared/constants/battleConstants';
import { GAMEPLAY_RULES } from '../constants/gameplay';
import { rtcService } from '../services/WebRTCDataChannelService';
import { wsService } from '../services/WebSocketService';
import { State, useFSMStore, type PlayMode } from '../store/useFSMStore';
import { PLAYER_ID } from '../utils/identity';
import { localizeCastStart, localizeResult, localizeTimeout } from '../utils/localizeEvent';
import { showSubtitle } from '../utils/uiEvents';
import type { BattleUiState, UiText } from '../types/app';

type UseSpecialCastingArgs = {
  battleStateRef: MutableRefObject<BattleUiState>;
  isMatchPaused: boolean;
  matchAlignmentReady: boolean;
  playMode: PlayMode;
  resolveSpecialResult: (result: { verdict: 'critical' | 'miss' }) => void;
  setBattleState: Dispatch<SetStateAction<BattleUiState>>;
  setCastingSpecial: () => void;
  specialPhrase: string;
  startStream: (params?: {
    preferredStream?: MediaStream | null;
    recognizedPhrase?: string;
    expectedPhrase?: string;
  }) => Promise<void>;
  stopStream: () => void;
  t: UiText;
};

export const useSpecialCasting = ({
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
}: UseSpecialCastingArgs) => {
  const castEndsAtRef = useRef<number>(0);
  const specialRetryRef = useRef(0);
  const judgeTimeoutRef = useRef<number | null>(null);

  const clearJudgeTimeout = useCallback(() => {
    if (judgeTimeoutRef.current !== null) {
      clearTimeout(judgeTimeoutRef.current);
      judgeTimeoutRef.current = null;
    }
  }, []);

  const handleCastSpecial = useCallback(async (options?: { recognizedPhrase?: string }) => {
    const battleState = battleStateRef.current;
    const recognizedPhrase = options?.recognizedPhrase?.trim() || '';

    if (playMode === 'hub' || playMode === 'walk') {
      showSubtitle(t.battleOnlyHint);
      return;
    }
    if (playMode === 'match' && !matchAlignmentReady) {
      console.info('[Special] blocked: arena alignment pending');
      showSubtitle(t.alignPending);
      return;
    }
    if (playMode === 'match' && isMatchPaused) {
      console.info('[Special] blocked: match is paused');
      showSubtitle('試合が一時停止中です');
      return;
    }
    if (!battleState.specialReady) {
      console.info(`[Special] blocked: EX gauge ${battleState.exGauge}/${EX_GAUGE.MAX}`);
      showSubtitle(`EXゲージ不足 (${battleState.exGauge}/${EX_GAUGE.MAX})`);
      return;
    }

    castEndsAtRef.current = Date.now() + GAMEPLAY_RULES.specialChargeMs;
    specialRetryRef.current = 0;
    setBattleState((prev) => ({ ...prev, specialReady: false, exGauge: 0 }));
    clearJudgeTimeout();
    setCastingSpecial();
    console.info('[Special] casting started');
    showSubtitle(localizeCastStart(specialPhrase || undefined));

    const castPayload: Record<string, unknown> = { action: 'casting_special' };
    if (playMode === 'training' && specialPhrase) {
      wsService.sendEvent({
        event: 'incantation_submitted',
        user: PLAYER_ID,
        payload: {
          phrase: specialPhrase,
          expected_phrase: specialPhrase,
          recognized_phrase: recognizedPhrase || undefined,
        },
      });
      castPayload.kind = 'incantation_request';
      castPayload.phrase = specialPhrase;
      castPayload.expected_phrase = specialPhrase;
      if (recognizedPhrase) {
        castPayload.recognized_phrase = recognizedPhrase;
      }
    }

    const castEvent = {
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: castPayload,
    } as const;
    if (!rtcService.send({ type: 'event', data: castEvent })) {
      wsService.sendEvent(castEvent);
    }

    await startStream({
      preferredStream: rtcService.getLocalStream(),
      recognizedPhrase,
      expectedPhrase: specialPhrase || undefined,
    });

    const scheduleJudgeTimeout = (delayMs: number) => {
      judgeTimeoutRef.current = window.setTimeout(async () => {
        if (useFSMStore.getState().currentState !== State.CASTING_SPECIAL) return;

        if (specialRetryRef.current < GAMEPLAY_RULES.specialJudgeRetryCount) {
          specialRetryRef.current += 1;
          stopStream();
          await startStream({
            preferredStream: rtcService.getLocalStream(),
            recognizedPhrase,
            expectedPhrase: specialPhrase || undefined,
          });
          showSubtitle('判定再試行...');
          scheduleJudgeTimeout(1200);
          return;
        }

        resolveSpecialResult({ verdict: 'miss' });
        const timeoutPayload = {
          event: 'debuff_applied',
          user: PLAYER_ID,
          payload: { reason: 'special_judge_timeout', timeout: true },
        } as const;
        if (!rtcService.send({ type: 'event', data: timeoutPayload })) {
          wsService.sendEvent(timeoutPayload);
        }
        showSubtitle(localizeTimeout());
      }, delayMs);
    };

    scheduleJudgeTimeout(GAMEPLAY_RULES.specialChargeMs);
  }, [
    battleStateRef,
    clearJudgeTimeout,
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
    ]);

  useEffect(() => {
    const onAttackResult = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      const verdict = detail.verdict === 'critical' ? 'critical' : 'miss';
      const delay = Math.max(0, castEndsAtRef.current - Date.now());
      clearJudgeTimeout();
      specialRetryRef.current = 0;

      window.setTimeout(() => {
        resolveSpecialResult({ verdict });

        const payload = {
          event: verdict === 'critical' ? 'critical_hit' : 'debuff_applied',
          user: PLAYER_ID,
          payload: detail,
        } as const;

        if (!detail.broadcasted) {
          if (!rtcService.send({ type: 'event', data: payload })) {
            wsService.sendEvent(payload);
          }
        }

        const suffix =
          typeof detail.video_frame_count === 'number'
            ? ` (src:${detail.source ?? 'n/a'}, vf:${detail.video_frame_count}, sr:${detail.sync_rate ?? 'n/a'})`
            : '';
        showSubtitle(`${localizeResult(verdict)}${suffix}`);
      }, delay);
    };

    window.addEventListener('attack_result', onAttackResult);
    return () => window.removeEventListener('attack_result', onAttackResult);
  }, [clearJudgeTimeout, resolveSpecialResult]);

  useEffect(() => {
    const onVoiceCastSpecial = (event: Event) => {
      const detail = (event as CustomEvent<{ transcript?: string }>).detail;
      void handleCastSpecial({ recognizedPhrase: detail?.transcript });
    };

    window.addEventListener('voice_cast_special', onVoiceCastSpecial as EventListener);
    return () => {
      window.removeEventListener('voice_cast_special', onVoiceCastSpecial as EventListener);
    };
  }, [handleCastSpecial]);

  useEffect(() => {
    return () => {
      clearJudgeTimeout();
    };
  }, [clearJudgeTimeout]);

  return { handleCastSpecial };
};
