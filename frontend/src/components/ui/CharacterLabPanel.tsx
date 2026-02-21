import React, { useMemo, useState } from 'react';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { resolveRobotPalette } from '../../utils/characterDNA';

interface CharacterLabPanelProps {
  open: boolean;
  onClose: () => void;
  baseDna: CharacterDNA;
  material: string;
  totalMatches: number;
  recentFeedbackCount: number;
  onSubmit: (payload: {
    choice: 'A' | 'B';
    scoreA: number;
    scoreB: number;
    note: string;
    variantA: CharacterDNA;
    variantB: CharacterDNA;
  }) => void;
}

const PALETTE_ROTATION: CharacterDNA['paletteFamily'][] = ['marine', 'ember', 'forest', 'royal', 'obsidian', 'sunset'];

const rotatePalette = (base: CharacterDNA['paletteFamily'], step: number): CharacterDNA['paletteFamily'] => {
  const idx = Math.max(0, PALETTE_ROTATION.indexOf(base));
  return PALETTE_ROTATION[(idx + step + PALETTE_ROTATION.length) % PALETTE_ROTATION.length];
};

export const CharacterLabPanel: React.FC<CharacterLabPanelProps> = ({
  open,
  onClose,
  baseDna,
  material,
  totalMatches,
  recentFeedbackCount,
  onSubmit,
}) => {
  const [choice, setChoice] = useState<'A' | 'B'>('A');
  const [scoreA, setScoreA] = useState(0.75);
  const [scoreB, setScoreB] = useState(0.75);
  const [note, setNote] = useState('');

  const variants = useMemo(() => {
    const variantA: CharacterDNA = {
      ...baseDna,
      finish: baseDna.finish === 'gloss' ? 'satin' : 'gloss',
      paletteFamily: rotatePalette(baseDna.paletteFamily, 1),
    };
    const variantB: CharacterDNA = {
      ...baseDna,
      finish: baseDna.finish === 'matte' ? 'satin' : 'matte',
      paletteFamily: rotatePalette(baseDna.paletteFamily, 3),
    };
    return { variantA, variantB };
  }, [baseDna]);

  const paletteA = useMemo(() => resolveRobotPalette(material, variants.variantA), [material, variants.variantA]);
  const paletteB = useMemo(() => resolveRobotPalette(material, variants.variantB), [material, variants.variantB]);

  if (!open) return null;

  return (
    <div className="lab-overlay">
      <section className="lab-card">
        <header className="lab-head">
          <div>
            <h3>Character Lab (A/B)</h3>
            <p>{`Matches: ${totalMatches} / Feedback: ${recentFeedbackCount}`}</p>
          </div>
          <button className="hud-btn hud-btn-carbon" onClick={onClose}>Close</button>
        </header>

        <div className="lab-grid">
          <article className={`lab-variant ${choice === 'A' ? 'is-selected' : ''}`}>
            <h4>Variant A</h4>
            <div className="lab-swatch-row">
              <span style={{ background: paletteA.white }} />
              <span style={{ background: paletteA.blue }} />
              <span style={{ background: paletteA.red }} />
              <span style={{ background: paletteA.cyan }} />
            </div>
            <div className="lab-meta">{`${variants.variantA.finish} / ${variants.variantA.paletteFamily}`}</div>
            <label className="lab-score">
              Score A {scoreA.toFixed(2)}
              <input type="range" min={0} max={1} step={0.01} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} />
            </label>
            <button className="hud-btn hud-btn-blue" onClick={() => setChoice('A')}>Choose A</button>
          </article>

          <article className={`lab-variant ${choice === 'B' ? 'is-selected' : ''}`}>
            <h4>Variant B</h4>
            <div className="lab-swatch-row">
              <span style={{ background: paletteB.white }} />
              <span style={{ background: paletteB.blue }} />
              <span style={{ background: paletteB.red }} />
              <span style={{ background: paletteB.cyan }} />
            </div>
            <div className="lab-meta">{`${variants.variantB.finish} / ${variants.variantB.paletteFamily}`}</div>
            <label className="lab-score">
              Score B {scoreB.toFixed(2)}
              <input type="range" min={0} max={1} step={0.01} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} />
            </label>
            <button className="hud-btn hud-btn-teal" onClick={() => setChoice('B')}>Choose B</button>
          </article>
        </div>

        <label className="lab-note">
          Comment
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. A has stronger silhouette"
          />
        </label>

        <div className="lab-actions">
          <button
            className="hud-btn hud-btn-green"
            onClick={() => onSubmit({ choice, scoreA, scoreB, note, variantA: variants.variantA, variantB: variants.variantB })}
          >
            Save Feedback
          </button>
        </div>
      </section>
    </div>
  );
};
