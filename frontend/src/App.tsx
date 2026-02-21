import React, { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Environment, OrbitControls } from '@react-three/drei';
import { RobotCharacter } from './components/RobotCharacter';
import { RemoteRobotCharacter } from './components/RemoteRobotCharacter';
import { ServerDrivenPanel } from './components/ui/ServerDrivenPanel';
import { DynamicSubtitle } from './components/ui/DynamicSubtitle';
import { useVoiceController } from './hooks/useVoiceController';
import { useWebXRScanner } from './hooks/useWebXRScanner';
import { useAICommandListener } from './hooks/useAICommandListener';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { wsService } from './services/WebSocketService';
import { rtcService } from './services/WebRTCDataChannelService';
import { State, useFSMStore } from './store/useFSMStore';
import { navMesh } from './utils/NavMeshGenerator';
import * as THREE from 'three';
import type { WebRTCDataChannelPayload, GameEvent } from '../../shared/types/events';

const WS_URL    = import.meta.env.VITE_WS_URL    ?? 'ws://localhost:8000/ws/game';
const PLAYER_ID = import.meta.env.VITE_PLAYER_ID ?? 'player1';

const store = createXRStore();

// ── Inner scene (must render inside Canvas + XR) ─────────────────────────────
const MainScene: React.FC = () => {
  const { hoverMatrix } = useWebXRScanner();
  useVoiceController();
  useAICommandListener();

  // Listen for NavMesh ready event (fired by useWebXRScanner once point-cloud is dense)
  useEffect(() => {
    const handler = async (e: Event) => {
      const points = (e as CustomEvent<THREE.Vector3[]>).detail;
      await navMesh.buildFromPoints(points);
    };
    window.addEventListener('navmesh_ready', handler);
    return () => window.removeEventListener('navmesh_ready', handler);
  }, []);

  // Placement indicator at the current hit-test surface point
  const indicatorPos = hoverMatrix
    ? new THREE.Vector3().setFromMatrixPosition(hoverMatrix)
    : null;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <Environment preset="city" />
      <RobotCharacter />

      {/* Hit-test placement ring */}
      {indicatorPos && (
        <mesh position={indicatorPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#00ffff" side={2} />
        </mesh>
      )}

      {/* Ground for non-AR debug view */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#e0e0e0" />
      </mesh>
    </>
  );
};

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const { isStreaming, startStream } = useAudioStreamer();
  const setCastingSpecial = useFSMStore(s => s.setCastingSpecial);
  const resolveSpecialResult = useFSMStore(s => s.resolveSpecialResult);
  const castEndsAtRef = useRef<number>(0);
  const handleRemoteBattleEvent = (evt: GameEvent) => {
    if (!evt?.event || evt.user === PLAYER_ID) return;
    if (evt.event === 'critical_hit') {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: `${evt.user} が CRITICAL HIT!` }
      }));
    }
    if (evt.event === 'debuff_applied') {
      window.dispatchEvent(new CustomEvent('show_subtitle', {
        detail: { text: `${evt.user} の必殺技は失敗...` }
      }));
    }
  };

  // Connect WebSocket on mount
  useEffect(() => {
    wsService.connect(WS_URL, PLAYER_ID);
    rtcService.start(PLAYER_ID);
    return () => {
      rtcService.stop();
      wsService.disconnect();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = wsService.addHandler((payload: WebRTCDataChannelPayload) => {
      if (payload.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onP2PPayload = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      if (payload?.type !== 'event') return;
      handleRemoteBattleEvent(payload.data as GameEvent);
    };
    window.addEventListener('webrtc_payload', onP2PPayload as EventListener);
    return () => window.removeEventListener('webrtc_payload', onP2PPayload as EventListener);
  }, []);

  useEffect(() => {
    const onAttackResult = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {};
      const verdict = detail.verdict === 'critical' ? 'critical' : 'miss';
      const delay = Math.max(0, castEndsAtRef.current - Date.now());

      window.setTimeout(() => {
        resolveSpecialResult({ verdict });

        const payload = {
          event: verdict === 'critical' ? 'critical_hit' : 'debuff_applied',
          user: PLAYER_ID,
          payload: detail,
        } as const;

        if (!rtcService.send({ type: 'event', data: payload })) {
          wsService.sendEvent(payload);
        }

        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: verdict === 'critical' ? 'CRITICAL HIT!!' : 'MISS...' }
        }));
      }, delay);
    };

    window.addEventListener('attack_result', onAttackResult);
    return () => window.removeEventListener('attack_result', onAttackResult);
  }, [resolveSpecialResult]);

  const handleCastSpecial = async () => {
    // 1) Instantly enter CASTING state and lock the next 3s for latency concealment
    castEndsAtRef.current = Date.now() + 3000;
    setCastingSpecial();

    // 2) Visual feedback starts immediately while backend inference runs in parallel
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: '詠唱開始... 超絶熱々揚げ春巻きストライク！！' }
    }));

    // 3) Sync casting start so the opponent can render the same charge phase
    const castEvent = {
      event: 'buff_applied',
      user: PLAYER_ID,
      payload: { action: 'casting_special' }
    } as const;
    if (!rtcService.send({ type: 'event', data: castEvent })) {
      wsService.sendEvent(castEvent);
    }

    // 4) Start raw audio stream in parallel with the 3s charge window
    await startStream();

    // 5) Failsafe: if backend never returns, unlock after a hard timeout.
    window.setTimeout(() => {
      if (useFSMStore.getState().currentState === State.CASTING_SPECIAL) {
        resolveSpecialResult({ verdict: 'miss' });
        window.dispatchEvent(new CustomEvent('show_subtitle', {
          detail: { text: '判定タイムアウト: MISS' }
        }));
      }
    }, 6500);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#111' }}>
      {/* AR entry */}
      <button
        id="btn-enter-ar"
        style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, padding: '8px 16px', borderRadius: 6 }}
        onClick={() => store.enterAR()}
      >
        Enter AR
      </button>

      {/* Special move trigger (charge animation + live audio stream) */}
      <button
        id="btn-cast-special"
        disabled={isStreaming}
        style={{
          position: 'absolute', bottom: 24, right: 24, zIndex: 10,
          padding: '18px 24px', fontSize: 18, borderRadius: 10,
          background: isStreaming ? '#555' : '#cc2200', color: 'white',
          cursor: isStreaming ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
        }}
        onClick={handleCastSpecial}
      >
        {isStreaming ? '詠唱中…' : 'CAST SPECIAL ⚡'}
      </button>

      <Canvas shadows>
        <XR store={store}>
          <MainScene />
          <RemoteRobotCharacter />
          <OrbitControls makeDefault />
        </XR>
      </Canvas>

      <ServerDrivenPanel />
      <DynamicSubtitle />
    </div>
  );
}

export default App;
