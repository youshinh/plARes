import * as THREE from 'three';

const HEAD_TARGET_RE = /(head|helmet|visor|face|mask|brow|eye)/i;

export const isHeadProjectionTarget = (nodeName: string) => HEAD_TARGET_RE.test(nodeName);

export const createHeadProjectionMaterial = (
  faceTexture: THREE.Texture,
  emissiveColor: THREE.ColorRepresentation,
): THREE.MeshPhysicalMaterial => {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: faceTexture,
    roughness: 0.28,
    metalness: 0.18,
    emissive: new THREE.Color(emissiveColor),
    emissiveIntensity: 0.08,
    clearcoat: 0.5,
    clearcoatRoughness: 0.18,
  });
  ((material as unknown) as { skinning?: boolean }).skinning = true;
  return material;
};
