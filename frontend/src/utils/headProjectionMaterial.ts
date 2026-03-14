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
    radius = 50,
  }: {
    radius?: number;
    offsetZ?: number;
    offsetY?: number;
  } = {},
): THREE.Object3D => {
  const decalTexture = faceTexture.clone();
  // We want the texture to appear correctly oriented.
  // Since the source is often a CanvasTexture with flipY=false or a standard loader result,
  // we align it with Three.js SphereGeometry mapping expectations.
  decalTexture.flipY = false;
  decalTexture.colorSpace = THREE.SRGBColorSpace;
  decalTexture.needsUpdate = true;

  // ── Sphere-segment wrapping the face around the head ──
  //
  // Geometry is centered around phi=0 (which is +X in Three.js).
  // Head bone's local +Y is "up", +Z is usually "forward" or -Z.
  //
  // To align phi=0 with "character forward":
  // If we assume bone forward is Z:
  // 1. Rotate 90° around Y so +X faces Z.
  const phiStart = -Math.PI * -0.75;
  const phiLength = Math.PI * 0.45;
  const thetaStart = Math.PI * 0.05;
  const thetaLength = Math.PI * 0.8;

  const geometry = new THREE.SphereGeometry(
    10,
    32,
    24,
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
  // Correcting the observed 180° + 90° rotation:
  // PI/2 on X tips it, but we also need to account for the sideways tilt.
  // Let's use a rotation that aligns the patch's Y-up with the bone's Y-up.
  mesh.rotation.set(0, Math.PI / 2, Math.PI / 1.7);
  mesh.position.set(0, -9, -5);
  mesh.renderOrder = 48;
  mesh.frustumCulled = false;
  return mesh;
};
