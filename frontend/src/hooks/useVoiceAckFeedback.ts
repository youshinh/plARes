import { useEffect, useRef, useState } from 'react';
import type { UiText } from '../types/app';

export const useVoiceAckFeedback = (t: UiText) => {
  const [voiceAckText, setVoiceAckText] = useState('');
  const voiceAckTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const commandLabels: Record<string, string> = {
      special: t.voiceCmdSpecial,
      dodge: t.voiceCmdDodge,
      forward: t.voiceCmdForward,
      attack: t.voiceCmdAttack,
      flank: t.voiceCmdFlank,
    };

    const onVoiceFeedback = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string }>).detail;
      const command = detail?.command ?? '';
      const label = commandLabels[command];
      if (!label) return;

      setVoiceAckText(`${t.voiceAckPrefix}: ${label}`);
      if (voiceAckTimerRef.current !== null) {
        clearTimeout(voiceAckTimerRef.current);
      }
      voiceAckTimerRef.current = window.setTimeout(() => {
        setVoiceAckText('');
        voiceAckTimerRef.current = null;
      }, 1600);
    };

    window.addEventListener('voice_command_feedback', onVoiceFeedback as EventListener);
    return () => {
      window.removeEventListener('voice_command_feedback', onVoiceFeedback as EventListener);
      if (voiceAckTimerRef.current !== null) {
        clearTimeout(voiceAckTimerRef.current);
        voiceAckTimerRef.current = null;
      }
    };
  }, [t]);

  return voiceAckText;
};
