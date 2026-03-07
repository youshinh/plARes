import * as THREE from 'three';
import { MOUNT_PARENT_BONES, MOUNT_POINTS, type MountPointId } from '../components/robot/constants';

export const injectMountPoints = (heroScene: THREE.Group): Record<MountPointId, THREE.Object3D | null> => {
  const result = {} as Record<MountPointId, THREE.Object3D | null>;

  (Object.keys(MOUNT_POINTS) as MountPointId[]).forEach((mountId) => {
    const nodeName = MOUNT_POINTS[mountId];
    let node = heroScene.getObjectByName(nodeName);

    if (!node) {
      const parent = MOUNT_PARENT_BONES[mountId]
        .map((name) => heroScene.getObjectByName(name))
        .find(Boolean);
      if (parent) {
        const mountNode = new THREE.Group();
        mountNode.name = nodeName;
        parent.add(mountNode);
        node = mountNode;
      }
    }

    result[mountId] = node ?? null;
  });

  return result;
};
