import * as THREE from 'three';

const HEAD_TARGET_RE = /(head|helmet|visor|face|mask|brow|eye)/i;
const FACE_DECAL_TARGET_RE = /(headfront|head|neck)/i;

export const isHeadProjectionTarget = (nodeName: string) => HEAD_TARGET_RE.test(nodeName);

export const findFaceDecalAnchor = (root: THREE.Object3D): THREE.Object3D | null => {
  let preferred: THREE.Object3D | null = null;
  let fallback: THREE.Object3D | null = null;

  root.traverse((node) => {
    if (!node.name) return;
    if (/headfront/i.test(node.name)) {
      preferred = node;
      return;
    }
    if (!fallback && FACE_DECAL_TARGET_RE.test(node.name)) {
      fallback = node;
    }
  });

  return preferred ?? fallback;
};

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

export const createFaceDecal = (
  faceTexture: THREE.Texture,
  {
    width = 10,
    height = 12,
    offsetZ = 1.8,
    offsetY = 0,
  }: {
    width?: number;
    height?: number;
    offsetZ?: number;
    offsetY?: number;
  } = {},
) => {
  const decalTexture = faceTexture.clone();
  decalTexture.flipY = true;
  decalTexture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: decalTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    opacity: 0.98,
    sizeAttenuation: true,
  });
  material.alphaTest = 0.02;
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, offsetY, offsetZ);
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0.52);
  sprite.renderOrder = 48;
  sprite.frustumCulled = false;
  return sprite;
};
