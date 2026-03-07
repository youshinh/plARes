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
    radius = 7.2,
    offsetZ = 0,
    offsetY = 0,
  }: {
    radius?: number;
    offsetZ?: number;
    offsetY?: number;
  } = {},
): THREE.Object3D => {
  const decalTexture = faceTexture.clone();
  decalTexture.flipY = true;
  decalTexture.needsUpdate = true;

  // Create a sphere-segment that wraps the face around the head.
  // phiStart / phiLength control horizontal coverage (~162°, ear-to-ear).
  // thetaStart / thetaLength control vertical coverage (forehead to chin).
  const phiStart = -Math.PI * 0.45;
  const phiLength = Math.PI * 0.9;
  const thetaStart = Math.PI * 0.18;
  const thetaLength = Math.PI * 0.48;

  const geometry = new THREE.SphereGeometry(
    radius,
    32,               // widthSegments
    24,               // heightSegments
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );

  const material = new THREE.MeshBasicMaterial({
    map: decalTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    opacity: 0.98,
    alphaTest: 0.02,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Rotate 180° so the texture faces inward toward the model surface.
  mesh.rotation.y = Math.PI;
  mesh.position.set(0, offsetY, offsetZ);
  mesh.renderOrder = 48;
  mesh.frustumCulled = false;
  return mesh;
};
