import { useEffect, useRef } from 'react';

export const useBgmAudio = (bgmUrl: string) => {
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      bgmAudioRef.current = null;
    }
    if (!bgmUrl) return;

    const audio = new Audio(bgmUrl);
    audio.volume = 0.5;
    audio.loop = false;
    bgmAudioRef.current = audio;
    audio.play().catch((error) => {
      console.warn('[BGM] Autoplay blocked or load failed:', error);
    });

    return () => {
      audio.pause();
      audio.src = '';
      bgmAudioRef.current = null;
    };
  }, [bgmUrl]);
};
