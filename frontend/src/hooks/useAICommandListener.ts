import { useEffect } from 'react';
import { useFSMStore } from '../store/useFSMStore';
import { useArenaSyncStore } from '../store/useArenaSyncStore';
import * as THREE from 'three';
import { wsService } from '../services/WebSocketService';
import type { WebRTCDataChannelPayload, GameEvent } from '../../../shared/types/events';

/**
 * Binds the FSM Priority-2 layer to the live WebSocket (Agent 3 backend).
 *
 * Incoming server messages are the language-agnostic JSON payloads defined in
 * shared/types/events.d.ts.  When the backend ADK issues a tactical Function
 * Calling result the JSON lands here as a GameEvent:
 *   e.g. { event: "buff_applied", payload: { action: "take_cover", target: { x,y,z } } }
 *
 * The handler promotes the command into the FSM store, which sets Priority 2
 * state and overrides the local navmesh goal (Priority 3 loop picks it up next frame).
 */
export const useAICommandListener = () => {
  const setAICommand = useFSMStore(s => s.setAICommand);

  useEffect(() => {
    const applyPayload = (payload: WebRTCDataChannelPayload) => {
      if (!useArenaSyncStore.getState().matchAlignmentReady) return;
      if (payload?.type !== 'event') return;
      const evt = payload.data as GameEvent;

      const cmd = (evt as any).payload as { action: string; target?: { x: number; y: number; z: number } };
      if (!cmd?.action) return;

      const target = cmd.target
        ? new THREE.Vector3(cmd.target.x, cmd.target.y, cmd.target.z)
        : undefined;

      setAICommand({ action: cmd.action, target });
    };

    const unsubscribe = wsService.addHandler(applyPayload);

    const onP2P = (event: Event) => {
      const payload = (event as CustomEvent<WebRTCDataChannelPayload>).detail;
      applyPayload(payload);
    };
    window.addEventListener('webrtc_payload', onP2P as EventListener);

    return () => {
      unsubscribe();
      window.removeEventListener('webrtc_payload', onP2P as EventListener);
    };
  }, [setAICommand]);
};
