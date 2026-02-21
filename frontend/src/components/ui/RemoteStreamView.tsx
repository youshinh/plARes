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
    <div className="remote-stream-view">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        className="remote-stream-video"
      />
    </div>
  );
};
