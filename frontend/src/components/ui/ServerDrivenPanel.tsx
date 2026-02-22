import React, { useEffect, useState } from 'react';
import { wsService } from '../../services/WebSocketService';
import { useFSMStore } from '../../store/useFSMStore';
import * as THREE from 'three';
import type { WebRTCDataChannelPayload, GameEvent } from '../../../../shared/types/events';
import { PLAYER_ID, PLAYER_LANG } from '../../utils/identity';

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
  const lang = (PLAYER_LANG || 'en-US').toLowerCase();
  const [isOpen, setIsOpen] = useState(true);

  const title = lang.startsWith('ja')
    ? '戦術オプション'
    : lang.startsWith('es')
      ? 'OPCIONES TACTICAS'
      : 'TACTICAL OPTIONS';

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
    wsService.sendEvent({ event: 'buff_applied', user: PLAYER_ID, payload: { action: t.action } });
  };

  if (tactics.length === 0) return null;

  return (
    <div className={`tactics-panel hud-animate ${!isOpen ? 'is-collapsed' : ''}`}>
      <h3
        className="tactics-title"
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
      >
        {title}
        <span>{isOpen ? '▼' : '▲'}</span>
      </h3>
      
      {isOpen && tactics.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          className="tactics-item"
        >
          <strong className="tactics-item-title">{t.title}</strong>
          <small className="tactics-item-detail">{t.detail}</small>
        </button>
      ))}
    </div>
  );
};
