import React, { useEffect, useState, useRef } from 'react';

// ⚡ Bolt: Wrapped DynamicSubtitle in React.memo to prevent unnecessary re-renders
// when the parent component (App.tsx) re-renders frequently. Also fixed race conditions
// with multiple rapid subtitles by properly clearing the previous timeout.
export const DynamicSubtitle: React.FC = React.memo(() => {
  const [subtitle, setSubtitle] = useState('');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleSubtitle = (e: Event) => {
       const customEvent = e as CustomEvent<{ text: string }>;
       setSubtitle(customEvent.detail.text);

       if (timeoutRef.current !== null) {
         window.clearTimeout(timeoutRef.current);
       }

       timeoutRef.current = window.setTimeout(() => {
         setSubtitle('');
         timeoutRef.current = null;
       }, 5000);
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
