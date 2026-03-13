import React from 'react';
import type { ScanState } from '../../hooks/useWebXRScanner';

/**
 * T1-4: AR 平面検出ガイドオーバーレイ
 *
 * scanState に応じてユーザーへの指示を表示する。
 * 'ready' 状態になると自動的にフェードアウトする。
 *
 * Skill Reference: skills/agent1/webxr-spatial/SKILL.md (graceful degradation)
 */

const GUIDE_CONFIG: Record<ScanState, { emoji: string; text: string; visible: boolean }> = {
  idle:        { emoji: '⏳', text: '初期化中…',                               visible: true  },
  searching:   { emoji: '📱', text: 'カメラをゆっくり動かして\n平面を探してください', visible: true  },
  tracking:    { emoji: '🔍', text: 'いい感じ！もう少しスキャンを続けてください',   visible: true  },
  ready:       { emoji: '✅', text: '準備完了！ロボットを配置できます',             visible: false }, // auto-dismiss
  unsupported: { emoji: '⚙️', text: 'AR空間認識非対応。\n簡易モードで動作します',   visible: true  },
};

interface Props {
  scanState: ScanState;
  pointCount?: number;
}

// ⚡ Bolt: Wrapped ScanGuideOverlay in React.memo to prevent unnecessary re-renders.
// Since it receives primitive props (scanState, pointCount), it benefits significantly
// from memoization when the parent component re-renders due to other state changes.
export const ScanGuideOverlay: React.FC<Props> = React.memo(({ scanState, pointCount = 0 }) => {
  const config = GUIDE_CONFIG[scanState];

  // Auto-dismiss after 'ready' or if hidden
  if (!config.visible && scanState === 'ready') {
    return null;
  }

  const progress = scanState === 'tracking' ? Math.min(100, Math.round((pointCount / 50) * 100)) : 0;

  return (
    <div
      className="scan-guide-overlay"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 900,
        pointerEvents: 'none',
        textAlign: 'center',
        color: '#fff',
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
        transition: 'opacity 0.5s ease',
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: 8 }}>{config.emoji}</div>
      <div
        style={{
          fontSize: '0.9rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          lineHeight: 1.6,
          whiteSpace: 'pre-line',
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
        }}
      >
        {config.text}
      </div>

      {/* Progress bar during tracking */}
      {scanState === 'tracking' && (
        <div
          style={{
            marginTop: 12,
            width: 160,
            height: 4,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 2,
            overflow: 'hidden',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #4cc9f0, #4361ee)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}
    </div>
  );
});
