import { useEffect } from 'react';
import * as THREE from 'three';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import type { RobotStats } from '../../store/useFSMStore';
import { getSilhouetteScales } from '../../utils/characterDNA';

type BoneAxis = 'xz' | 'y';

type BoneConfig = {
  names: string[];
  axis: BoneAxis;
  range: [number, number];
};

const BONE_STAT_MAP: Record<keyof RobotStats, BoneConfig> = {
  power: {
    names: ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'mixamorigLeftArm', 'mixamorigRightArm', 'mixamorigLeftForeArm', 'mixamorigRightForeArm'],
    axis: 'xz',
    range: [0.85, 1.25],
  },
  speed: {
    names: ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'mixamorigLeftUpLeg', 'mixamorigRightUpLeg', 'mixamorigLeftLeg', 'mixamorigRightLeg'],
    axis: 'y',
    range: [0.92, 1.15],
  },
  vit: {
    names: ['Spine', 'Spine01', 'Spine02', 'LeftShoulder', 'RightShoulder', 'mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2', 'mixamorigLeftShoulder', 'mixamorigRightShoulder'],
    axis: 'xz',
    range: [0.9, 1.18],
  },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const applyAxisScale = (bone: THREE.Bone, axis: BoneAxis, scale: number) => {
  if (axis === 'xz') {
    bone.scale.x = scale;
    bone.scale.z = scale;
    return;
  }
  bone.scale.y = scale;
};

export const useRobotBoneScaling = (
  heroScene: THREE.Group | null,
  stats: RobotStats,
  dna: CharacterDNA,
) => {
  useEffect(() => {
    if (!heroScene) return;

    const touched = new Map<THREE.Bone, THREE.Vector3>();
    const remember = (bone: THREE.Bone) => {
      if (!touched.has(bone)) {
        touched.set(bone, bone.scale.clone());
      }
    };

    const silhouetteScale = getSilhouetteScales(dna);

    for (const [statKey, config] of Object.entries(BONE_STAT_MAP) as Array<[keyof RobotStats, BoneConfig]>) {
      const statValue = stats[statKey];
      const t = clamp01((statValue - 1) / 98);
      const scale = config.range[0] + t * (config.range[1] - config.range[0]);
      const appliedScale = config.axis === 'xz' ? scale * silhouetteScale.arm : scale * silhouetteScale.legY;

      for (const boneName of config.names) {
        const node = heroScene.getObjectByName(boneName);
        if (!node || !(node as THREE.Bone).isBone) continue;
        const bone = node as THREE.Bone;
        remember(bone);
        applyAxisScale(bone, config.axis, appliedScale);
      }
    }

    return () => {
      touched.forEach((original, bone) => {
        bone.scale.copy(original);
      });
    };
  }, [dna, heroScene, stats]);
};
