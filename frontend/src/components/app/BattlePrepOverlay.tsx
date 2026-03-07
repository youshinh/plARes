import { useState, type FC } from 'react';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { getModelTypeCopy, MODEL_TYPE_OPTIONS, type ModelTypeId } from '../../constants/modelTypes';
import { resolveRobotPalette, type PaletteFamily } from '../../utils/characterDNA';
import type { UiText } from '../../types/app';

const PREP_PALETTES: PaletteFamily[] = ['marine', 'ember', 'forest', 'royal', 'obsidian', 'sunset'];

const paletteLabel = (palette: PaletteFamily, t: UiText) =>
  ({
    marine: t.prepPaletteMarine,
    ember: t.prepPaletteEmber,
    forest: t.prepPaletteForest,
    royal: t.prepPaletteRoyal,
    obsidian: t.prepPaletteObsidian,
    sunset: t.prepPaletteSunset,
  }[palette] ?? palette);

type BattlePrepOverlayProps = {
  t: UiText;
  hasRouteFoundation: boolean;
  isSolo: boolean;
  currentModelType: ModelTypeId;
  enemyModelType: ModelTypeId;
  robotDna: CharacterDNA;
  enemyRobotDna: CharacterDNA;
  robotMaterial: 'Wood' | 'Metal' | 'Resin';
  alignmentReady: boolean;
  hasWalkMilestone: boolean;
  hasTrainingMilestone: boolean;
  onSelectModelType: (type: ModelTypeId) => void;
  onSelectEnemyModelType: (type: ModelTypeId) => void;
  onSelectPaletteFamily: (palette: PaletteFamily) => void;
  onSelectEnemyPaletteFamily: (palette: PaletteFamily) => void;
  onStartWalk: () => void;
  onStartTraining: () => void;
  onEnterBattleMode: () => void;
  onCloseBattlePrep: () => void;
};

export const BattlePrepOverlay: FC<BattlePrepOverlayProps> = ({
  t,
  hasRouteFoundation,
  isSolo,
  currentModelType,
  enemyModelType,
  robotDna,
  enemyRobotDna,
  robotMaterial,
  alignmentReady,
  hasWalkMilestone,
  hasTrainingMilestone,
  onSelectModelType,
  onSelectEnemyModelType,
  onSelectPaletteFamily,
  onSelectEnemyPaletteFamily,
  onStartWalk,
  onStartTraining,
  onEnterBattleMode,
  onCloseBattlePrep,
}) => {
  const activePalette = robotDna.paletteFamily;
  const activeEnemyPalette = enemyRobotDna.paletteFamily;
  const [activeTab, setActiveTab] = useState<'self' | 'enemy'>('self');

  return (
    <section className="battle-prep-overlay hud-animate" aria-label={t.prepTitle}>
      <div className="battle-prep-card">
        <h2>{t.prepTitle}</h2>
        <p>{t.prepDesc}</p>
        <ol className="battle-prep-list">
          <li className={`battle-prep-item ${hasRouteFoundation ? 'is-ready' : 'is-missing'}`}>
            <span>{t.prepStepRoute}</span>
            <strong>{hasRouteFoundation ? t.prepReady : t.prepMissing}</strong>
          </li>
          <li className="battle-prep-item is-ready">
            <span>{t.prepStepModel}</span>
            <strong>{`Type ${currentModelType}`}</strong>
          </li>
          <li className={`battle-prep-item ${alignmentReady ? 'is-ready' : 'is-guide'}`}>
            <span>{t.prepStepAlign}</span>
            <strong>{alignmentReady ? t.prepReady : t.prepAlignGuide}</strong>
          </li>
        </ol>

        {isSolo && (
          <div className="battle-prep-tabs">
            <button
              type="button"
              className={`battle-prep-tab ${activeTab === 'self' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('self')}
            >
              {t.prepOwnMachine}
            </button>
            <button
              type="button"
              className={`battle-prep-tab ${activeTab === 'enemy' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('enemy')}
            >
              {t.prepEnemyMachine}
            </button>
          </div>
        )}

        {(!isSolo || activeTab === 'self') && (
          <>
            <div className="battle-prep-section">
              <div className="battle-prep-section-label">{t.prepSelectFrame}</div>
              <div className="battle-prep-option-grid is-duo">
                {MODEL_TYPE_OPTIONS.map(({ id }) => {
                  const copy = getModelTypeCopy(id, t);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`battle-prep-option ${currentModelType === id ? 'is-active' : ''}`}
                      onClick={() => onSelectModelType(id)}
                    >
                      <strong>{copy.title}</strong>
                      <span>{copy.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="battle-prep-section">
              <div className="battle-prep-section-label">{t.prepStepPalette}</div>
              <div className="battle-prep-option-grid">
                {PREP_PALETTES.map((paletteFamily) => {
                  const palette = resolveRobotPalette(robotMaterial, { ...robotDna, paletteFamily });
                  return (
                    <button
                      key={paletteFamily}
                      type="button"
                      className={`battle-prep-option battle-prep-palette ${activePalette === paletteFamily ? 'is-active' : ''}`}
                      onClick={() => onSelectPaletteFamily(paletteFamily)}
                    >
                      <div className="battle-prep-swatch-row">
                        <span style={{ background: palette.white }} />
                        <span style={{ background: palette.blue }} />
                        <span style={{ background: palette.red }} />
                        <span style={{ background: palette.cyan }} />
                      </div>
                      <strong>{paletteLabel(paletteFamily, t)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {isSolo && activeTab === 'enemy' && (
          <>
            <div className="battle-prep-section">
              <div className="battle-prep-section-label">{t.prepEnemyFrame}</div>
              <div className="battle-prep-option-grid is-duo">
                {MODEL_TYPE_OPTIONS.map(({ id }) => {
                  const copy = getModelTypeCopy(id, t);
                  return (
                    <button
                      key={`enemy-${id}`}
                      type="button"
                      className={`battle-prep-option ${enemyModelType === id ? 'is-active' : ''}`}
                      onClick={() => onSelectEnemyModelType(id)}
                    >
                      <strong>{copy.title}</strong>
                      <span>{copy.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="battle-prep-section">
              <div className="battle-prep-section-label">{t.prepEnemyPalette}</div>
              <div className="battle-prep-option-grid">
                {PREP_PALETTES.map((paletteFamily) => {
                  const palette = resolveRobotPalette(robotMaterial, { ...enemyRobotDna, paletteFamily });
                  return (
                    <button
                      key={`enemy-palette-${paletteFamily}`}
                      type="button"
                      className={`battle-prep-option battle-prep-palette ${activeEnemyPalette === paletteFamily ? 'is-active' : ''}`}
                      onClick={() => onSelectEnemyPaletteFamily(paletteFamily)}
                    >
                      <div className="battle-prep-swatch-row">
                        <span style={{ background: palette.white }} />
                        <span style={{ background: palette.blue }} />
                        <span style={{ background: palette.red }} />
                        <span style={{ background: palette.cyan }} />
                      </div>
                      <strong>{paletteLabel(paletteFamily, t)}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="battle-prep-actions">
          {!hasWalkMilestone && (
            <button className="hud-btn hud-btn-teal hud-btn-mini" onClick={onStartWalk}>
              {t.prepGoWalk}
            </button>
          )}
          {!hasTrainingMilestone && (
            <button className="hud-btn hud-btn-blue hud-btn-mini" onClick={onStartTraining}>
              {t.prepGoTraining}
            </button>
          )}
          <button className="hud-btn hud-btn-warn hud-btn-mini" onClick={onEnterBattleMode}>
            {t.prepStartNow}
          </button>
          <button className="hud-btn hud-btn-carbon hud-btn-mini" onClick={onCloseBattlePrep}>
            {t.prepBackHub}
          </button>
        </div>
      </div>
    </section>
  );
};
