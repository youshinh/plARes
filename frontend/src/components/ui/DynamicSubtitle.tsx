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
    <div style={{ 
      position: 'absolute', 
      bottom: 50, 
      left: '50%', 
      transform: 'translateX(-50%)', 
      background: 'rgba(255, 0, 0, 0.8)', 
      color: 'white', 
      padding: '15px 30px', 
      borderRadius: 12,
      fontSize: '24px',
      fontWeight: 'bold',
      textAlign: 'center',
      pointerEvents: 'none'
    }}>
      {subtitle}
    </div>
  );
};
