import React, { useEffect, useState, useRef } from 'react';

const DISPLAY_MS = 3200;

const speak = (text: string) => {
  if (
    typeof window === 'undefined' ||
    typeof window.speechSynthesis === 'undefined' ||
    !text.trim()
  ) {
    return;
  }

  // Cancel any in-progress speech so lines don't pile up.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = document.documentElement.lang || navigator.language || 'ja-JP';
  utterance.rate = 1.15;
  utterance.pitch = 1.0;
  utterance.volume = 0.75;

  // Pick a voice that matches the page language.
  const voices = window.speechSynthesis.getVoices();
  const lang2 = utterance.lang.slice(0, 2).toLowerCase();
  const preferredVoice =
    voices.find((v) => v.lang.toLowerCase() === utterance.lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang2));
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  window.speechSynthesis.speak(utterance);
};

// ⚡ Bolt: Wrapped DynamicSubtitle in React.memo to prevent unnecessary re-renders
// when the parent component (App.tsx) re-renders frequently. Also fixed race conditions
// with multiple rapid subtitles by properly clearing the previous timeout.
export const DynamicSubtitle: React.FC = React.memo(() => {
  const [subtitle, setSubtitle] = useState('');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleSubtitle = (e: Event) => {
       const customEvent = e as CustomEvent<{ text: string; silent?: boolean }>;
       const text = customEvent.detail.text;
       setSubtitle(text);

       // Speak the subtitle aloud (unless explicitly silenced).
       if (!customEvent.detail.silent) {
         speak(text);
       }

       if (timeoutRef.current !== null) {
         window.clearTimeout(timeoutRef.current);
       }

       timeoutRef.current = window.setTimeout(() => {
         setSubtitle('');
         timeoutRef.current = null;
       }, DISPLAY_MS);
    };

    window.addEventListener('show_subtitle', handleSubtitle);
    return () => {
      window.removeEventListener('show_subtitle', handleSubtitle);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!subtitle) return null;

  return (
    <div className="hud-subtitle">
      {subtitle}
    </div>
  );
});
