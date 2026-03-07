import * as THREE from 'three';

export const normalizeEquipmentGlb = (scene: THREE.Group, targetSize = 0.3) => {
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
  const scale = targetSize / maxDim;

  scene.scale.setScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(scene);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  const min = scaledBounds.min.clone();
  scene.position.sub(new THREE.Vector3(center.x, min.y, center.z));

  return { scale, bounds: scaledBounds };
};
