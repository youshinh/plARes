import { useMemo, useState, type FC } from 'react';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { getModelTypeCopy, getModelTypeMeta, type ModelTypeId } from '../../constants/modelTypes';
import { resolveRobotPalette, type PaletteFamily } from '../../utils/characterDNA';
import type { UiText } from '../../types/app';
import { ModelTypeList } from './ModelTypeList';

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
  const [activeTab, setActiveTab] = useState<'self' | 'enemy'>('self');
  const activePalette = robotDna.paletteFamily;
  const activeEnemyPalette = enemyRobotDna.paletteFamily;
  const activeType = activeTab === 'enemy' ? enemyModelType : currentModelType;
  const activeDna = activeTab === 'enemy' ? enemyRobotDna : robotDna;
  const activeTypeCopy = useMemo(() => getModelTypeCopy(activeType, t), [activeType, t]);
  const activePaletteValue = activeTab === 'enemy' ? activeEnemyPalette : activePalette;
  const handleTypeChange = activeTab === 'enemy' ? onSelectEnemyModelType : onSelectModelType;
  const handlePaletteChange = activeTab === 'enemy' ? onSelectEnemyPaletteFamily : onSelectPaletteFamily;

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
            <strong>{activeTypeCopy.title}</strong>
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

        <div className="battle-prep-section">
          <div className="battle-prep-section-label">
            {activeTab === 'enemy' ? t.prepEnemyFrame : t.prepSelectFrame}
          </div>
          <div className="battle-prep-selection-summary">
            <strong>{activeTypeCopy.title}</strong>
            <span>{activeTypeCopy.description}</span>
          </div>
          <ModelTypeList t={t} value={activeType} onChange={handleTypeChange} />
        </div>

        <div className="battle-prep-section">
          <div className="battle-prep-section-label">
            {activeTab === 'enemy' ? t.prepEnemyPalette : t.prepStepPalette}
          </div>
          <div className="battle-prep-palette-grid compact">
            {PREP_PALETTES.map((paletteFamily) => {
              const palette = resolveRobotPalette(getModelTypeMeta(activeType).material, { ...activeDna, paletteFamily });
              return (
                <button
                  key={`${activeTab}-${paletteFamily}`}
                  type="button"
                  className={`battle-prep-palette-chip ${activePaletteValue === paletteFamily ? 'is-active' : ''}`}
                  onClick={() => handlePaletteChange(paletteFamily)}
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
