export const SPEED_NORMAL = 1.5;
export const SPEED_EVADE = 5.0;
export const GROUND_CLEARANCE_EPSILON = 0.004;
export const GROUND_CONTACT_BIAS = -0.012;
export const ROOT_DRIVE_BONE_RE = /(armature|hips|mixamorighips|root)/i;

export const MOUNT_POINTS = {
  WEAPON_R: 'Node_Weapon_R',
  WEAPON_L: 'Node_Weapon_L',
  HEAD_ACCESSORY: 'Node_Head_Accessory',
  BACKPACK: 'Node_Backpack',
} as const;

export type MountPointId = keyof typeof MOUNT_POINTS;

export const MOUNT_POINT_OPTIONS: Array<{
  id: MountPointId;
  label: string;
  shortLabel: string;
}> = [
  { id: 'WEAPON_R', label: 'Right Weapon', shortLabel: 'R-Weapon' },
  { id: 'WEAPON_L', label: 'Left Weapon', shortLabel: 'L-Weapon' },
  { id: 'HEAD_ACCESSORY', label: 'Head Accessory', shortLabel: 'Head' },
  { id: 'BACKPACK', label: 'Back Pack', shortLabel: 'Back' },
];

export const MOUNT_PARENT_BONES: Record<MountPointId, string[]> = {
  WEAPON_R: ['RightHand', 'mixamorigRightHand'],
  WEAPON_L: ['LeftHand', 'mixamorigLeftHand'],
  HEAD_ACCESSORY: ['Head', 'mixamorigHead'],
  BACKPACK: ['Spine01', 'Spine', 'mixamorigSpine1', 'mixamorigSpine'],
};

export type AttachmentSlot = {
  mountPoint: MountPointId;
  glbUrl: string;
  label: string;
  scale: number;
  sourceImageUrl?: string;
};
