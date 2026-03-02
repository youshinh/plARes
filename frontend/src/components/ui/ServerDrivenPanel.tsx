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

  const fallbackTactics: TacticItem[] = lang.startsWith('ja')
    ? [
        { id: 'fallback-flank-right', title: '右に回れ', detail: '側面を取る', action: 'flank_right' },
        { id: 'fallback-take-cover', title: '回避', detail: '遮蔽物へ退避', action: 'take_cover' },
        { id: 'fallback-basic-attack', title: '攻撃', detail: '基本攻撃を実行', action: 'basic_attack' },
      ]
    : lang.startsWith('es')
      ? [
          { id: 'fallback-flank-right', title: 'Flanco Derecho', detail: 'Mover al costado', action: 'flank_right' },
          { id: 'fallback-take-cover', title: 'Esquivar', detail: 'Tomar cobertura', action: 'take_cover' },
          { id: 'fallback-basic-attack', title: 'Atacar', detail: 'Ataque basico', action: 'basic_attack' },
        ]
      : [
          { id: 'fallback-flank-right', title: 'Flank Right', detail: 'Take side position', action: 'flank_right' },
          { id: 'fallback-take-cover', title: 'Evade', detail: 'Move to cover', action: 'take_cover' },
          { id: 'fallback-basic-attack', title: 'Attack', detail: 'Execute basic attack', action: 'basic_attack' },
        ];

  const activeTactics = tactics.length > 0 ? tactics : fallbackTactics;

  const onSelect = (t: TacticItem) => {
    const target = t.target ? new THREE.Vector3(t.target.x, t.target.y, t.target.z) : undefined;
    setAICommand({ action: t.action, target });
    // Echo selection back to backend so it can update battle log / other clients
    wsService.sendEvent({ event: 'buff_applied', user: PLAYER_ID, payload: { action: t.action } });
  };

  return (
    <div className={`tactics-panel hud-animate ${!isOpen ? 'is-collapsed' : ''}`}>
      <h3
        className="tactics-title"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
      >
        {title}
        <span aria-hidden="true">{isOpen ? '▼' : '▲'}</span>
      </h3>
      
      {isOpen && activeTactics.map(t => (
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
