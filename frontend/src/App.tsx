import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Environment, OrbitControls } from '@react-three/drei';
import { RobotCharacter } from './components/RobotCharacter';
import { ServerDrivenPanel } from './components/ui/ServerDrivenPanel';
import { DynamicSubtitle } from './components/ui/DynamicSubtitle';
import { useVoiceController } from './hooks/useVoiceController';
import { useWebXRScanner } from './hooks/useWebXRScanner';
import { useAICommandListener } from './hooks/useAICommandListener';
import { useAudioStreamer } from './hooks/useAudioStreamer';
import { wsService } from './services/WebSocketService';
import { useFSMStore } from './store/useFSMStore';
import { navMesh } from './utils/NavMeshGenerator';
import * as THREE from 'three';

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
  const setCasting = useFSMStore(s => s.setAICommand); // reuse to flip state

  // Connect WebSocket on mount
  useEffect(() => {
    wsService.connect(WS_URL, PLAYER_ID);
    return () => wsService.disconnect();
  }, []);

  const handleCastSpecial = async () => {
    // 1. Instantly set FSM state to CASTING (latency concealment – Doc §5.1)
    setCasting({ action: 'casting_special' });

    // 2. Show chant subtitle (localised text will come from backend in production;
    //    this is a temporary display for the charge animation window)
    window.dispatchEvent(new CustomEvent('show_subtitle', {
      detail: { text: '超絶熱々揚げ春巻きストライク！！' }
    }));

    // 3. Start real audio stream in parallel – races against charge animation
    await startStream();
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
          <OrbitControls makeDefault />
        </XR>
      </Canvas>

      <ServerDrivenPanel />
      <DynamicSubtitle />
    </div>
  );
}

export default App;
