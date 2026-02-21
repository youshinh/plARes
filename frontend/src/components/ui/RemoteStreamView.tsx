import React, { useEffect, useRef, useState } from 'react';

export const RemoteStreamView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onRemoteStream = (event: Event) => {
      const stream = (event as CustomEvent<{ stream: MediaStream }>).detail?.stream;
      if (!stream || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      setVisible(true);
    };

    window.addEventListener('webrtc_remote_stream', onRemoteStream as EventListener);
    return () => window.removeEventListener('webrtc_remote_stream', onRemoteStream as EventListener);
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 20,
        bottom: 140,
        width: 220,
        height: 140,
        borderRadius: 10,
        overflow: 'hidden',
        border: '2px solid rgba(255,255,255,0.35)',
        background: '#000',
        zIndex: 10,
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
};
