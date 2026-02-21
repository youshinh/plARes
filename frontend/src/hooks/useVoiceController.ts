import { useEffect } from 'react';
import { useFSMStore } from '../store/useFSMStore';
import * as THREE from 'three';

export const useVoiceController = () => {
  const setEmergencyEvade = useFSMStore((state) => state.setEmergencyEvade);

  useEffect(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language; // BCP-47

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.trim().toLowerCase();

      // Simple keyword detection for Priority 1 Action
      if (
        transcript.includes('dodge') ||
        transcript.includes('避ける') ||
        transcript.includes('避けろ')
      ) {
        setEmergencyEvade(new THREE.Vector3(1, 0, 0)); // Arbitrary right-dodge for now
      } else if (
        transcript.includes('forward') ||
        transcript.includes('前へ') ||
        transcript.includes('いけ')
      ) {
        setEmergencyEvade(new THREE.Vector3(0, 0, -1)); // Arbitrary forward
      }
    };

    recognition.start();

    return () => {
      recognition.stop();
    };
  }, [setEmergencyEvade]);
};
