import type { UiText } from '../types/app';

export const MODEL_TYPE_OPTIONS = [
  { id: 'wood_heavy', material: 'Wood', bodyType: 'heavy', assetSlot: 'B' },
  { id: 'wood_slim', material: 'Wood', bodyType: 'slim', assetSlot: 'A' },
  { id: 'resin_heavy', material: 'Resin', bodyType: 'heavy', assetSlot: 'B' },
  { id: 'resin_slim', material: 'Resin', bodyType: 'slim', assetSlot: 'A' },
  { id: 'metal_heavy', material: 'Metal', bodyType: 'heavy', assetSlot: 'B' },
  { id: 'metal_slim', material: 'Metal', bodyType: 'slim', assetSlot: 'A' },
] as const;

export type ModelTypeId = (typeof MODEL_TYPE_OPTIONS)[number]['id'];
export type ModelMaterial = (typeof MODEL_TYPE_OPTIONS)[number]['material'];
export type ModelBodyType = (typeof MODEL_TYPE_OPTIONS)[number]['bodyType'];
export type LegacyModelAssetSlot = 'A' | 'B';

export const BASE_STAT_PRESETS: Record<ModelTypeId, { hp: number; speed: number; power: number }> = {
  wood_heavy: { hp: 80, speed: 30, power: 65 },
  wood_slim: { hp: 55, speed: 55, power: 50 },
  resin_heavy: { hp: 60, speed: 35, power: 85 },
  resin_slim: { hp: 35, speed: 95, power: 35 },
  metal_heavy: { hp: 99, speed: 20, power: 80 },
  metal_slim: { hp: 40, speed: 80, power: 75 },
};

type ModelTypeOption = (typeof MODEL_TYPE_OPTIONS)[number];

const MODEL_TYPE_MAP: Record<ModelTypeId, ModelTypeOption> = Object.fromEntries(
  MODEL_TYPE_OPTIONS.map((option) => [option.id, option]),
) as Record<ModelTypeId, ModelTypeOption>;

const MODEL_TYPE_IDS = new Set<ModelTypeId>(MODEL_TYPE_OPTIONS.map((option) => option.id));

export const isModelTypeId = (value: string | null | undefined): value is ModelTypeId =>
  Boolean(value) && MODEL_TYPE_IDS.has(value as ModelTypeId);

export const normalizeModelTypeId = (value: string | null | undefined): ModelTypeId => {
  if (isModelTypeId(value)) return value;
  if (value === 'A') return 'wood_slim';
  if (value === 'B') return 'metal_heavy';
  return 'wood_slim';
};

export const getModelTypeMeta = (modelType: ModelTypeId) => MODEL_TYPE_MAP[modelType];
export const getBaseStatPreset = (modelType: ModelTypeId) => BASE_STAT_PRESETS[modelType];

export const isHeavyModelType = (modelType: ModelTypeId) => MODEL_TYPE_MAP[modelType].bodyType === 'heavy';

export const resolveLegacyAssetSlot = (modelType: ModelTypeId): LegacyModelAssetSlot =>
  MODEL_TYPE_MAP[modelType].assetSlot;

export const resolveLegacyFallbackAssetSlot = (modelType: ModelTypeId): LegacyModelAssetSlot =>
  resolveLegacyAssetSlot(modelType) === 'A' ? 'B' : 'A';

export const resolveModelGlbPath = (modelType: ModelTypeId) =>
  `/models/${resolveLegacyAssetSlot(modelType)}/Character_output.glb`;

export const resolveFallbackModelGlbPath = (modelType: ModelTypeId) =>
  `/models/${resolveLegacyFallbackAssetSlot(modelType)}/Character_output.glb`;

const getMaterialLabel = (material: ModelMaterial, t: UiText) =>
  ({
    Wood: t.prepMaterialWood,
    Resin: t.prepMaterialResin,
    Metal: t.prepMaterialMetal,
  }[material]);

const getBodyLabel = (bodyType: ModelBodyType, t: UiText) =>
  ({
    heavy: t.prepBodyHeavy,
    slim: t.prepBodySlim,
  }[bodyType]);

const getBodyDescription = (bodyType: ModelBodyType, t: UiText) =>
  ({
    heavy: t.prepBodyHeavyDesc,
    slim: t.prepBodySlimDesc,
  }[bodyType]);

export const getModelTypeCopy = (modelType: ModelTypeId, t: UiText) => {
  const meta = getModelTypeMeta(modelType);
  return {
    title: `${getMaterialLabel(meta.material, t)} / ${getBodyLabel(meta.bodyType, t)}`,
    description: getBodyDescription(meta.bodyType, t),
    material: getMaterialLabel(meta.material, t),
    bodyType: getBodyLabel(meta.bodyType, t),
  };
};
