import type { UiText } from '../types/app';

export const MODEL_TYPE_OPTIONS = [
  { id: 'A' },
  { id: 'B' },
] as const;

export type ModelTypeId = (typeof MODEL_TYPE_OPTIONS)[number]['id'];

export const getModelTypeCopy = (modelType: ModelTypeId, t: UiText) => {
  if (modelType === 'A') {
    return {
      title: t.prepModelTypeA,
      description: t.prepModelTypeADesc,
    };
  }
  return {
    title: t.prepModelTypeB,
    description: t.prepModelTypeBDesc,
  };
};
