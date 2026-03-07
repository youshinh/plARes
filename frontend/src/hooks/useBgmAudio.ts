import { useEffect, useRef } from "react";

const playFallbackVictoryCue = () => {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ??
    (
      window as Window &
        typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    ).webkitAudioContext;
  if (typeof AudioContextCtor === "undefined") return null;

  const context = new AudioContextCtor();
  const startAt = context.currentTime + 0.03;
  const notes = [523.25, 659.25, 783.99, 1046.5];

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt + index * 0.16);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + index * 0.16 + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + index * 0.16 + 0.2,
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt + index * 0.16);
    oscillator.stop(startAt + index * 0.16 + 0.22);
  });

  const closeTimer = window.setTimeout(() => {
    void context.close().catch(() => {});
  }, 1200);

  return () => {
    window.clearTimeout(closeTimer);
    void context.close().catch(() => {});
  };
};

export const useBgmAudio = (bgmUrl: string, fallbackCue: number) => {
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cleanupFallback: (() => void) | null = null;

    if (bgmAudioRef.current) {
      bgmAudioRef.current.pause();
      bgmAudioRef.current = null;
    }

    if (!bgmUrl) {
      if (fallbackCue > 0) {
        cleanupFallback = playFallbackVictoryCue();
      }
      return () => {
        cleanupFallback?.();
      };
    }

    const audio = new Audio(bgmUrl);
    audio.volume = 0.5;
    audio.loop = false;
    bgmAudioRef.current = audio;
    const fallbackOnce = () => {
      if (!cleanupFallback) {
        cleanupFallback = playFallbackVictoryCue();
      }
    };
    audio.addEventListener("error", fallbackOnce, { once: true });
    audio.play().catch((error) => {
      console.warn("[BGM] Autoplay blocked or load failed:", error);
      fallbackOnce();
    });

    return () => {
      audio.removeEventListener("error", fallbackOnce);
      audio.pause();
      audio.src = "";
      bgmAudioRef.current = null;
      cleanupFallback?.();
    };
  }, [bgmUrl, fallbackCue]);
};
