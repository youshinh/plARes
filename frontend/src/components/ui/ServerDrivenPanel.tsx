import React, { useEffect, useState } from 'react';
import { wsService } from '../../services/WebSocketService';
import { useFSMStore } from '../../store/useFSMStore';
import * as THREE from 'three';
import type { WebRTCDataChannelPayload, GameEvent } from '../../../../shared/types/events';

interface TacticItem {
  id: string;
  title: string;
  detail: string;
  action: string;
  target?: { x: number; y: number; z: number };
}

/**
 * ServerDrivenPanel
 *
 * Architecture (Doc §10.2):
 * - Receives JSON tactical arrays from the backend via the live WebSocket.
 * - Renders tactic buttons purely from the received data (no hardcoded strings).
 * - On button press, sends the selected action back to backend AND pushes the
 *   AI command into the FSM (Priority 2 override).
 *
 * The backend sends tactic payloads as GameEvent.payload of type TacticItem[].
 */
export const ServerDrivenPanel: React.FC = () => {
  const [tactics, setTactics] = useState<TacticItem[]>([]);
  const setAICommand = useFSMStore(s => s.setAICommand);

  useEffect(() => {
    const unsubscribe = wsService.addHandler((payload: WebRTCDataChannelPayload) => {
      if (payload.type !== 'event') return;
      const evt = payload.data as GameEvent;
      const items = (evt as any).payload as TacticItem[] | undefined;
      if (Array.isArray(items) && items.length > 0 && items[0].action) {
        setTactics(items);
      }
    });
    return () => { unsubscribe(); };
  }, []);

  const onSelect = (t: TacticItem) => {
    const target = t.target ? new THREE.Vector3(t.target.x, t.target.y, t.target.z) : undefined;
    setAICommand({ action: t.action, target });
    // Echo selection back to backend so it can update battle log / other clients
    wsService.sendEvent({ event: 'buff_applied', user: 'player1', payload: { action: t.action } });
  };

  if (tactics.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', top: 20, right: 20,
      background: 'rgba(0,0,0,0.75)', color: 'white',
      padding: 12, borderRadius: 10, minWidth: 200
    }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 14, letterSpacing: 1 }}>TACTICAL OPTIONS</h3>
      {tactics.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          style={{
            display: 'block', width: '100%', margin: '4px 0', padding: '10px 12px',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', cursor: 'pointer', borderRadius: 6, textAlign: 'left'
          }}
        >
          <strong>{t.title}</strong>
          <br />
          <small style={{ opacity: 0.7 }}>{t.detail}</small>
        </button>
      ))}
    </div>
  );
};
