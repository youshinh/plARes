import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { wsService } from '../services/WebSocketService';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import type { SyncData, WebRTCDataChannelPayload } from '../../../shared/types/events';
import { PLAYER_ID } from '../utils/identity';

export const RemoteRobotCharacter: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(1, 0, -1.5));

  useEffect(() => {
    const applySync = (sync: SyncData) => {
      if (sync.userId === PLAYER_ID) return;
      const mapped = useArenaSyncStore.getState().mapRemotePosition(sync.userId, sync.position);
      targetRef.current.set(mapped.x, mapped.y, mapped.z);
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
    if (!groupRef.current) return;
    const current = groupRef.current.position;
    current.lerp(targetRef.current, Math.min(1, delta * 8));
    groupRef.current.lookAt(targetRef.current.x, current.y, targetRef.current.z);
  });

  return (
    <group ref={groupRef} position={[1, 0, -1.5]}>
      <mesh position={[0, 0.84, 0.01]} castShadow>
        <sphereGeometry args={[0.11, 18, 12]} />
        <meshStandardMaterial color="#67A8FF" emissive="#2C75F5" emissiveIntensity={0.45} transparent opacity={0.72} roughness={0.25} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.84, 0.1]} castShadow>
        <boxGeometry args={[0.08, 0.026, 0.01]} />
        <meshStandardMaterial color="#A6F7FF" emissive="#7DEEFF" emissiveIntensity={1.15} transparent opacity={0.86} roughness={0.08} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.53, 0]} castShadow>
        <boxGeometry args={[0.28, 0.23, 0.17]} />
        <meshStandardMaterial color="#78B4FF" emissive="#346AD8" emissiveIntensity={0.42} transparent opacity={0.58} roughness={0.3} metalness={0.62} />
      </mesh>
      <mesh position={[0, 0.02, 0.1]} castShadow>
        <torusGeometry args={[0.055, 0.007, 10, 22]} />
        <meshStandardMaterial color="#A6F7FF" emissive="#7DEEFF" emissiveIntensity={1.2} transparent opacity={0.9} roughness={0.1} metalness={0.86} />
      </mesh>
      <mesh position={[-0.26, 0.47, 0]} castShadow>
        <cylinderGeometry args={[0.037, 0.041, 0.31, 10]} />
        <meshStandardMaterial color="#78B4FF" emissive="#2E6AD5" emissiveIntensity={0.34} transparent opacity={0.56} roughness={0.34} metalness={0.58} />
      </mesh>
      <mesh position={[0.26, 0.47, 0]} castShadow>
        <cylinderGeometry args={[0.037, 0.041, 0.31, 10]} />
        <meshStandardMaterial color="#78B4FF" emissive="#2E6AD5" emissiveIntensity={0.34} transparent opacity={0.56} roughness={0.34} metalness={0.58} />
      </mesh>
      <mesh position={[-0.1, 0.11, 0]} castShadow>
        <cylinderGeometry args={[0.043, 0.05, 0.36, 12]} />
        <meshStandardMaterial color="#6AA8FF" emissive="#2A63D5" emissiveIntensity={0.35} transparent opacity={0.6} roughness={0.32} metalness={0.58} />
      </mesh>
      <mesh position={[0.1, 0.11, 0]} castShadow>
        <cylinderGeometry args={[0.043, 0.05, 0.36, 12]} />
        <meshStandardMaterial color="#6AA8FF" emissive="#2A63D5" emissiveIntensity={0.35} transparent opacity={0.6} roughness={0.32} metalness={0.58} />
      </mesh>
      <mesh position={[-0.1, -0.13, 0.03]} castShadow>
        <boxGeometry args={[0.09, 0.03, 0.12]} />
        <meshStandardMaterial color="#76B2FF" emissive="#2F66D7" emissiveIntensity={0.28} transparent opacity={0.66} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.1, -0.13, 0.03]} castShadow>
        <boxGeometry args={[0.09, 0.03, 0.12]} />
        <meshStandardMaterial color="#76B2FF" emissive="#2F66D7" emissiveIntensity={0.28} transparent opacity={0.66} roughness={0.4} metalness={0.5} />
      </mesh>
    </group>
  );
};
