import { useEffect, useRef, type FC } from 'react';
import { Environment } from '@react-three/drei';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { RobotCharacter } from '../RobotCharacter';
import { RemoteRobotCharacter } from '../RemoteRobotCharacter';
import { useVoiceController } from '../../hooks/useVoiceController';
import { useWebXRScanner } from '../../hooks/useWebXRScanner';
import { useAICommandListener } from '../../hooks/useAICommandListener';
import { wsService } from '../../services/WebSocketService';
import { rtcService } from '../../services/WebRTCDataChannelService';
import { useFSMStore } from '../../store/useFSMStore';
import { navMesh } from '../../utils/NavMeshGenerator';
import { PLAYER_ID } from '../../utils/identity';

type MainSceneProps = {
  shadowsEnabled: boolean;
};

export const MainScene: FC<MainSceneProps> = ({ shadowsEnabled }) => {
  const { session } = useXR();
  const { hoverMatrix, depthTexture, depthRawToMeters } = useWebXRScanner();
  const playMode = useFSMStore(s => s.playMode);
  const setLocalRobotPosition = useFSMStore(s => s.setLocalRobotPosition);
  const showOpponent = playMode === 'match';
  const sessionAnchorLockedRef = useRef(false);

  useVoiceController();
  useAICommandListener();

  useEffect(() => {
    sessionAnchorLockedRef.current = false;
  }, [session]);

  useEffect(() => {
    if (!session || !hoverMatrix || sessionAnchorLockedRef.current) return;

    const anchor = new THREE.Vector3().setFromMatrixPosition(hoverMatrix);
    if (![anchor.x, anchor.y, anchor.z].every(Number.isFinite)) return;

    setLocalRobotPosition(anchor);
    sessionAnchorLockedRef.current = true;
  }, [hoverMatrix, session, setLocalRobotPosition]);

  useEffect(() => {
    const handler = async (event: Event) => {
      const points = (event as CustomEvent<THREE.Vector3[]>).detail;
      await navMesh.buildFromPoints(points);

      if (!rtcService.isOpen()) return;
      const plainPoints = points.map(point => ({ x: point.x, y: point.y, z: point.z }));
      rtcService.sendNavMesh(plainPoints);
    };

    window.addEventListener('navmesh_ready', handler);
    return () => window.removeEventListener('navmesh_ready', handler);
  }, []);

  useEffect(() => {
    const handler = async (event: Event) => {
      const pointsData = (event as CustomEvent<Array<{ x: number; y: number; z: number }>>).detail;
      if (!Array.isArray(pointsData)) return;

      console.info('[NavMesh] Received remote navmesh points, building local navmesh...');
      const points = pointsData.map(point => new THREE.Vector3(point.x, point.y, point.z));
      await navMesh.buildFromPoints(points);
      window.dispatchEvent(
        new CustomEvent('show_subtitle', { detail: { text: 'Remote NavMesh loaded' } }),
      );
    };

    window.addEventListener('remote_navmesh_ready', handler);
    return () => window.removeEventListener('remote_navmesh_ready', handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const { trigger, context } = (event as CustomEvent<{ trigger: string; context: string }>).detail;
      if (playMode !== 'walk') return;

      console.info(`[Vision] Auto-trigger detected: ${trigger} (${context})`);
      wsService.sendEvent({
        event: 'walk_vision_trigger',
        user: PLAYER_ID,
        target: PLAYER_ID,
        payload: { trigger, context: `auto_${context}` },
      });
    };

    window.addEventListener('vision_trigger_detected', handler);
    return () => window.removeEventListener('vision_trigger_detected', handler);
  }, [playMode]);

  const indicatorPos = hoverMatrix
    ? new THREE.Vector3().setFromMatrixPosition(hoverMatrix)
    : null;
  const showGround = !session || session.environmentBlendMode === 'opaque';

  return (
    <>
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#CFE8FF', '#1B2634', 0.8]} />
      <directionalLight
        position={[4, 8, 6]}
        intensity={1.4}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-2.5, 1.8, 2.2]} intensity={0.9} color="#7BC8FF" />
      <pointLight position={[2.2, 1.1, -1.5]} intensity={0.55} color="#FFB26B" />
      <Environment preset="sunset" />
      <RobotCharacter />
      {showOpponent && (
        <RemoteRobotCharacter depthTexture={depthTexture} depthRawToMeters={depthRawToMeters} />
      )}
      {indicatorPos && (
        <mesh position={indicatorPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#00ffff" side={2} />
        </mesh>
      )}
      {showGround && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadowsEnabled}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#2C313A" roughness={0.86} metalness={0.08} />
        </mesh>
      )}
    </>
  );
};
