import type { FC } from 'react';
import {
  getModelTypeCopy,
  MODEL_TYPE_OPTIONS,
  type ModelTypeId,
} from '../../constants/modelTypes';
import type { UiText } from '../../types/app';

type ModelTypeListProps = {
  t: UiText;
  value: ModelTypeId;
  onChange: (type: ModelTypeId) => void;
  compact?: boolean;
};

export const ModelTypeList: FC<ModelTypeListProps> = ({
  t,
  value,
  onChange,
  compact = false,
}) => (
  <div className={`model-type-list ${compact ? 'is-compact' : ''}`}>
    {MODEL_TYPE_OPTIONS.map(({ id }) => {
      const copy = getModelTypeCopy(id, t);
      return (
        <button
          key={id}
          type="button"
          className={`model-type-item ${value === id ? 'is-active' : ''}`}
          onClick={() => onChange(id)}
        >
          <div className="model-type-item-head">
            <strong>{copy.title}</strong>
            <div className="model-type-chip-row">
              <span className="model-type-chip">{copy.material}</span>
              <span className="model-type-chip">{copy.bodyType}</span>
            </div>
          </div>
          <span>{copy.description}</span>
        </button>
      );
    })}
  </div>
);
