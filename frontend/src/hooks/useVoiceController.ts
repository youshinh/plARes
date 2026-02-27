import { useEffect, useRef } from 'react';
import { useFSMStore } from '../store/useFSMStore';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import * as THREE from 'three';

type SpeechRecognitionResultLike = {
  transcript: string;
};

type SpeechRecognitionResultListLike = {
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResultListLike;
  };
};

type SpeechRecognitionErrorLike = {
  error: string;
};

type SpeechRecognitionInstanceLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionInstanceLike;

export const useVoiceController = () => {
  const setEmergencyEvade = useFSMStore((state) => state.setEmergencyEvade);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    // Check if browser supports Web Speech API
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructorLike;
      webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
    };
    const SpeechRecognition =
      speechWindow.SpeechRecognition ||
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[VoiceController] Web Speech API is not supported in this browser.');
      return;
    }

    let recognition: SpeechRecognitionInstanceLike | null = null;

    const start = () => {
      if (stoppedRef.current) return;

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language; // BCP-47

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        if (!useArenaSyncStore.getState().matchAlignmentReady) return;
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript.trim().toLowerCase();
        
        console.info('[VoiceController] Heard:', transcript);

        // Simple keyword detection for Priority 1 Action
        if (
          transcript.includes('dodge') ||
          transcript.includes('避ける') ||
          transcript.includes('避けろ')
        ) {
          useFSMStore.getState().setEmergencyEvade(new THREE.Vector3(1, 0, 0), 0.9); // Right-dodge
        } else if (
          transcript.includes('forward') ||
          transcript.includes('前へ') ||
          transcript.includes('いけ') ||
          transcript.includes('走れ')
        ) {
          useFSMStore.getState().setEmergencyEvade(new THREE.Vector3(0, 0, -1), 1.2); // Forward charge
        } else if (
          transcript.includes('attack') ||
          transcript.includes('攻撃') ||
          transcript.includes('戦え') ||
          transcript.includes('やれ')
        ) {
          const fsm = useFSMStore.getState();
          const target = fsm.remoteRobotPosition?.clone();
          useFSMStore.getState().setAICommand({ action: 'basic_attack', target });
        } else if (
          transcript.includes('flank') ||
          transcript.includes('回り込め') ||
          transcript.includes('右')
        ) {
          const target = new THREE.Vector3(1.5, 0, 0); // Temporary target
          useFSMStore.getState().setAICommand({ action: 'flank_right', target });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorLike) => {
        // 'not-allowed' means mic permission was denied; don't retry endlessly.
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          console.warn('[VoiceController] Mic permission denied – voice control disabled.');
          stoppedRef.current = true;
          return;
        }
        console.warn('[VoiceController] SpeechRecognition error, will restart:', event.error);
      };

      // Browser ends the session after silence or errors; restart transparently.
      recognition.onend = () => {
        if (stoppedRef.current) return;
        // Small delay to avoid hot-looping if something causes repeated failures
        setTimeout(start, 500);
      };

      try {
        recognition.start();
      } catch (e) {
        // Catch DOMException if start() is called while already started
        console.warn('[VoiceController] Could not start SpeechRecognition:', e);
      }
    };

    start();

    return () => {
      stoppedRef.current = true;
      try { recognition?.stop(); } catch { /* ignore */ }
    };
  }, [setEmergencyEvade]);
};
