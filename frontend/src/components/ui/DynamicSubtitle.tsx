import React, { useEffect, useState } from 'react';

export const DynamicSubtitle: React.FC = () => {
  const [subtitle, setSubtitle] = useState('');

  useEffect(() => {
    // Listen for mock subtitle events
    const handleSubtitle = (e: any) => {
       setSubtitle(e.detail.text);
       setTimeout(() => setSubtitle(''), 5000);
    };

    window.addEventListener('show_subtitle', handleSubtitle);
    return () => window.removeEventListener('show_subtitle', handleSubtitle);
  }, []);

  if (!subtitle) return null;

  return (
    <div className="hud-subtitle">
      {subtitle}
    </div>
  );
};
