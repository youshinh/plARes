import React from 'react';
import { State, useFSMStore } from '../../store/useFSMStore';
import { COMBAT_STATE_POLICY } from '../../utils/characterAnimation';

const PRESET_STATES: State[] = [
  State.HOVERING,
  State.FLANKING_RIGHT,
  State.EMERGENCY_EVADE,
  State.EVADE_TO_COVER,
  State.BASIC_ATTACK,
  State.CASTING_SPECIAL,
  State.SUPER_SAIYAN,
  State.PUNCH,
  State.KICK,
  State.COMBO_PUNCH,
  State.DODGE_LEFT,
  State.DODGE_RIGHT,
  State.EVADE_BACK,
  State.DAMAGE,
  State.FAINT,
  State.CELEBRATE,
  State.TAUNT,
  State.IDLE,
  State.WALK,
  State.RUN,
  State.SUPER_DASH,
  State.SHORYUKEN,
  State.TORNADO_PUNCH,
  State.BEAM_CHARGE,
  State.HEAVY_WALK,
  State.STAGGER_WALK,
];

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  P1: { label: 'P1 Voice', color: '#ff4d6d' },
  P2: { label: 'P2 AI', color: '#fca311' },
  P3: { label: 'P3 Nav', color: '#4cc9f0' },
  debug: { label: 'Debug', color: '#b5179e' },
  system: { label: 'Sys', color: '#6c757d' },
};

export const AnimationDebugPanel: React.FC = () => {
  const currentState = useFSMStore((s) => s.currentState);
  const localHp = useFSMStore((s) => s.localHp);
  const enemyHp = useFSMStore((s) => s.enemyHp);
  const prioritySource = useFSMStore((s) => s.prioritySource);
  const transitionLog = useFSMStore((s) => s.transitionLog);
  const debugSetState = useFSMStore((s) => s.debugSetState);
  const debugSetHp = useFSMStore((s) => s.debugSetHp);
  const resetMatch = useFSMStore((s) => s.resetMatch);

  const badge = PRIORITY_BADGE[prioritySource] ?? PRIORITY_BADGE.system;

  return (
    <aside className="anim-debug-panel hud-animate">
      <h3 className="anim-debug-title">ANIM CHECK</h3>
      <div className="anim-debug-meta">
        <div>{`State: ${currentState}`}</div>
        <div>{`HP L:${localHp} / E:${enemyHp}`}</div>
        <div style={{ marginTop: 4 }}>
          <span
            style={{
              background: badge.color,
              color: '#fff',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* T1-3: Transition History (last 5) */}
      {transitionLog.length > 0 && (
        <div className="anim-debug-log" style={{ maxHeight: 80, overflowY: 'auto', fontSize: '0.65rem', opacity: 0.8, margin: '4px 0' }}>
          {transitionLog.slice(-5).reverse().map((entry, idx) => {
            const ago = Math.round((Date.now() - entry.ts) / 1000);
            return (
              <div key={`${entry.ts}-${idx}`} style={{ whiteSpace: 'nowrap' }}>
                {`${ago}s ago [${entry.source}] ${entry.from}→${entry.to}`}
              </div>
            );
          })}
        </div>
      )}

      <div className="anim-debug-grid">
        {PRESET_STATES.map((stateName) => {
          const policy = COMBAT_STATE_POLICY[stateName];
          const clip = policy?.animation.clip ?? 'Idle';
          return (
            <button
              key={stateName}
              className={`anim-debug-btn ${currentState === stateName ? 'is-active' : ''}`}
              onClick={() => debugSetState(stateName)}
            >
              <strong>{stateName}</strong>
              <small>{clip}</small>
            </button>
          );
        })}
      </div>
      <div className="anim-debug-actions">
        <button className="hud-btn hud-btn-danger hud-btn-mini" onClick={() => debugSetHp('local', 0)}>
          Local HP=0
        </button>
        <button className="hud-btn hud-btn-warn hud-btn-mini" onClick={() => debugSetHp('enemy', 0)}>
          Enemy HP=0
        </button>
        <button className="hud-btn hud-btn-green hud-btn-mini" onClick={resetMatch}>
          Reset
        </button>
      </div>
    </aside>
  );
};
