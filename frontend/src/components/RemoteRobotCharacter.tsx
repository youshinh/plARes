import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { wsService } from '../services/WebSocketService';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import type { SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { PLAYER_ID } from '../utils/identity';

export const RemoteRobotCharacter: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0.5, -1.5));

  useEffect(() => {
    const applySync = (sync: SyncData) => {
      if (sync.userId === PLAYER_ID) return;
      const mapped = useArenaSyncStore.getState().mapRemotePosition(sync.userId, sync.position);
      targetRef.current.set(mapped.x, mapped.y + 0.5, mapped.z);
    };

    const onP2P = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      if (payload?.type !== 'sync') return;
      applySync(payload.data as SyncData);
    };

    const unsubscribe = wsService.addHandler((payload) => {
      if (payload.type !== 'sync') return;
      applySync(payload.data as SyncData);
    });

    window.addEventListener('webrtc_payload', onP2P as EventListener);
    return () => {
      unsubscribe();
      window.removeEventListener('webrtc_payload', onP2P as EventListener);
    };
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const current = meshRef.current.position;
    current.lerp(targetRef.current, Math.min(1, delta * 8));
    meshRef.current.lookAt(targetRef.current.x, current.y, targetRef.current.z);
  });

  return (
    <mesh ref={meshRef} position={[1, 0.5, -1.5]} castShadow>
      <boxGeometry args={[0.5, 1, 0.5]} />
      <meshStandardMaterial color="#ff55aa" transparent opacity={0.8} />
    </mesh>
  );
};
