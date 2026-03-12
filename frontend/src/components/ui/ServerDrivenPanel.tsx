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

const buildLocalizedTacticItem = (action: string, lang: string): TacticItem => {
  const normalized = action.trim().toLowerCase();
  const ja = {
    take_cover: { title: '回避', detail: '遮蔽物へ退避' },
    observe: { title: '観察', detail: '相手の動きを見る' },
    charge: { title: '前進', detail: '圧をかけて距離を詰める' },
    flank_left: { title: '左に回れ', detail: '左側から回り込む' },
    flank_right: { title: '右に回れ', detail: '右側から回り込む' },
    attack: { title: '攻撃', detail: '基本攻撃を実行' },
    heavy_attack: { title: '強打', detail: '大振りの一撃を狙う' },
  } as const;
  const es = {
    take_cover: { title: 'Esquivar', detail: 'Tomar cobertura' },
    observe: { title: 'Observar', detail: 'Leer el movimiento rival' },
    charge: { title: 'Avanzar', detail: 'Cerrar distancia con presion' },
    flank_left: { title: 'Flanco Izquierdo', detail: 'Entrar por la izquierda' },
    flank_right: { title: 'Flanco Derecho', detail: 'Entrar por la derecha' },
    attack: { title: 'Atacar', detail: 'Ejecutar ataque basico' },
    heavy_attack: { title: 'Golpe Fuerte', detail: 'Buscar un impacto pesado' },
  } as const;
  const en = {
    take_cover: { title: 'Evade', detail: 'Move to cover' },
    observe: { title: 'Observe', detail: 'Read the opponent first' },
    charge: { title: 'Advance', detail: 'Close distance with pressure' },
    flank_left: { title: 'Flank Left', detail: 'Move around the left side' },
    flank_right: { title: 'Flank Right', detail: 'Take side position' },
    attack: { title: 'Attack', detail: 'Execute basic attack' },
    heavy_attack: { title: 'Heavy Attack', detail: 'Commit to a stronger strike' },
  } as const;
  const table = lang.startsWith('ja') ? ja : lang.startsWith('es') ? es : en;
  const localized = table[normalized as keyof typeof table] ?? {
    title: normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    detail: lang.startsWith('ja')
      ? 'ADKが提案した戦術'
      : lang.startsWith('es')
        ? 'Tactica sugerida por ADK'
        : 'ADK suggested tactic',
  };
  return {
    id: `adk-${normalized || 'observe'}`,
    action: normalized || 'observe',
    title: localized.title,
    detail: localized.detail,
  };
};

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
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1080;
  });
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1080;
  });

  const title = lang.startsWith('ja')
    ? '戦術オプション'
    : lang.startsWith('es')
      ? 'OPCIONES TACTICAS'
      : 'TACTICAL OPTIONS';

  useEffect(() => {
    const unsubscribe = wsService.addHandler((payload: WebRTCDataChannelPayload) => {
      if (payload.type !== 'event') return;
      const evt = payload.data as GameEvent;
      const rawPayload = (evt as any).payload;
      if (
        rawPayload &&
        typeof rawPayload === 'object' &&
        !Array.isArray(rawPayload) &&
        rawPayload.kind === 'tactical_recommendation'
      ) {
        const recommended = buildLocalizedTacticItem(String(rawPayload.action ?? 'observe'), lang);
        setTactics((prev) => {
          const deduped = prev.filter((item) => item.action !== recommended.action);
          return [recommended, ...deduped].slice(0, 4);
        });
        return;
      }
      const items = rawPayload as TacticItem[] | undefined;
      if (Array.isArray(items) && items.length > 0 && items[0].action) {
        setTactics(items);
      }
    });
    return () => { unsubscribe(); };
  }, [lang]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1080;
      setIsMobileViewport(mobile);
      if (mobile) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    <div className={`tactics-panel hud-animate ${!isOpen ? 'is-collapsed' : ''} ${isMobileViewport ? 'is-mobile' : ''}`}>
      <h3 className="tactics-title" style={{ margin: 0, padding: 0 }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            boxSizing: 'border-box',
          }}
          aria-expanded={isOpen}
          aria-controls="tactics-panel-content"
          className="tactics-title"
        >
          {title}
          <span aria-hidden="true">{isOpen ? '▼' : '▲'}</span>
        </button>
      </h3>

      {isOpen && (
        <div id="tactics-panel-content">
          {activeTactics.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className="tactics-item"
              aria-label={`${t.title}: ${t.detail}`}
            >
              <strong className="tactics-item-title">{t.title}</strong>
              <small className="tactics-item-detail">{t.detail}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
