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

export const AnimationDebugPanel: React.FC = () => {
  const currentState = useFSMStore((s) => s.currentState);
  const localHp = useFSMStore((s) => s.localHp);
  const enemyHp = useFSMStore((s) => s.enemyHp);
  const debugSetState = useFSMStore((s) => s.debugSetState);
  const debugSetHp = useFSMStore((s) => s.debugSetHp);
  const resetMatch = useFSMStore((s) => s.resetMatch);

  return (
    <aside className="anim-debug-panel hud-animate">
      <h3 className="anim-debug-title">ANIM CHECK</h3>
      <div className="anim-debug-meta">
        <div>{`State: ${currentState}`}</div>
        <div>{`HP L:${localHp} / E:${enemyHp}`}</div>
      </div>
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
