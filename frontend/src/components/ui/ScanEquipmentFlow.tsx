import type { FC } from 'react';
import { MOUNT_POINT_OPTIONS, type MountPointId } from '../robot/constants';
import type { UiText } from '../../types/app';

type ScanEquipmentFlowProps = {
  t: UiText;
  craftKind: 'skin' | 'attachment';
  mountPoint: MountPointId;
  onChangeCraftKind: (next: 'skin' | 'attachment') => void;
  onChangeMountPoint: (next: MountPointId) => void;
};

export const ScanEquipmentFlow: FC<ScanEquipmentFlowProps> = ({
  t,
  craftKind,
  mountPoint,
  onChangeCraftKind,
  onChangeMountPoint,
}) => (
  <div className="scan-equipment-flow">
    <div className="scan-equipment-kind-picker" role="tablist" aria-label={t.scanEquipmentModeLabel}>
      <button
        type="button"
        className={`hud-btn hud-btn-carbon ${craftKind === 'skin' ? 'is-selected' : ''}`}
        onClick={() => onChangeCraftKind('skin')}
      >
        {t.scanEquipmentModeSkin}
      </button>
      <button
        type="button"
        className={`hud-btn hud-btn-carbon ${craftKind === 'attachment' ? 'is-selected' : ''}`}
        onClick={() => onChangeCraftKind('attachment')}
      >
        {t.scanEquipmentModeAttachment}
      </button>
    </div>
    {craftKind === 'attachment' && (
      <div className="scan-equipment-mounts">
        <label>{t.scanEquipmentMountLabel}</label>
        <div className="scan-equipment-mount-grid">
          {MOUNT_POINT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`hud-btn hud-btn-carbon ${mountPoint === option.id ? 'is-selected' : ''}`}
              onClick={() => onChangeMountPoint(option.id)}
            >
              {option.shortLabel}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>
);
