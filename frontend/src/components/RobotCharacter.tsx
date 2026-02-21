import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useFSMStore, State } from '../store/useFSMStore';
import { navMesh } from '../utils/NavMeshGenerator';
import * as THREE from 'three';

const SPEED_NORMAL = 1.5;
const SPEED_EVADE  = 5.0;

/**
 * RobotCharacter
 *
 * Implements the Priority-3 movement loop (Doc §3.3):
 * - Each frame reads the current FSM state and target position from useFSMStore.
 * - If the NavMesh is built, runs findPath() via recast-wasm A* to get waypoints.
 * - Steps the mesh toward the next waypoint at the appropriate speed.
 * - Debug colour changes per FSM state for verification in AR view.
 */
export const RobotCharacter: React.FC = () => {
  const meshRef      = useRef<THREE.Mesh>(null);
  const waypointsRef = useRef<THREE.Vector3[]>([]);
  const lastTargetRef= useRef<THREE.Vector3 | null>(null);

  const { currentState, targetPosition } = useFSMStore();

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const pos = meshRef.current.position;

    // ── Recompute path when target changes ────────────────────────────────
    if (
      targetPosition &&
      (!lastTargetRef.current || !lastTargetRef.current.equals(targetPosition))
    ) {
      lastTargetRef.current = targetPosition.clone();
      waypointsRef.current = navMesh.findPath(pos.clone(), targetPosition);
    }

    // ── Step toward next waypoint ─────────────────────────────────────────
    const waypoints = waypointsRef.current;
    if (waypoints.length > 0) {
      const nextWp = waypoints[0];
      const dist = pos.distanceTo(nextWp);
      const speed = currentState === State.EMERGENCY_EVADE ? SPEED_EVADE : SPEED_NORMAL;

      if (dist < 0.05) {
        waypoints.shift(); // reached this waypoint, advance
      } else {
        const dir = new THREE.Vector3().subVectors(nextWp, pos).normalize();
        pos.addScaledVector(dir, Math.min(speed * delta, dist));
        // Face movement direction
        meshRef.current.lookAt(nextWp.x, pos.y, nextWp.z);
      }
    }

    // ── Debug colour per state ────────────────────────────────────────────
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    const colours: Record<State, string> = {
      [State.HOVERING]:       '#4488ff',
      [State.BASIC_ATTACK]:   '#ff4444',
      [State.EVADE_TO_COVER]: '#888888',
      [State.FLANKING_RIGHT]: '#44ff88',
      [State.EMERGENCY_EVADE]:'#ffff00',
      [State.CASTING_SPECIAL]:'#ff8800',
    };
    mat.color.set(colours[currentState] ?? '#ffffff');
  });

  return (
    <mesh ref={meshRef} position={[0, 0.5, -1]} castShadow>
      <boxGeometry args={[0.5, 1, 0.5]} />
      <meshStandardMaterial color="#4488ff" />
    </mesh>
  );
};
