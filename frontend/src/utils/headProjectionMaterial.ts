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
  // PNG with alpha from chroma-key removal — keep flipY=true (Three.js default for canvas sources).
  decalTexture.flipY = true;
  decalTexture.colorSpace = THREE.SRGBColorSpace;
  decalTexture.premultiplyAlpha = false;
  decalTexture.needsUpdate = true;

  // ── Sphere-segment wrapping the face around the head ──
  //
  // SphereGeometry phi sweeps horizontally starting from +X.
  // A negative phiStart centers the patch symmetrically around phi=0 (+X).
  //
  // The head bone's local +Y typically points "up along the spine" which,
  // for the head, maps to the CHARACTER'S FORWARD direction in world
  // space.  That means the sphere's equator (outward normals horizontal
  // in bone-local space) actually faces UPWARD in world space — which is
  // why photos showed the face on top of the head.
  //
  // Fix: after generating the sphere patch, rotate -90° around X so the
  // equatorial outward normals tilt from bone-horizontal (+X) to bone +Y
  // (= character forward).  Then rotate +90° around Y so phi=0 (+X after
  // the X-rotation it becomes +Z in bone space) points forward.
  const phiStart = -Math.PI * 0.45;          // centered on +X
  const phiLength = Math.PI * 0.9;           // ~162°, ear-to-ear
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
  // 1. Tip the face patch forward: -90° around X (bone-horizontal → bone +Y = char forward)
  // 2. No additional Y rotation needed since the patch is already centered on +X
  //    which, after the X-rotation, aligns with the bone's forward.
  mesh.rotation.set(Math.PI / 2, 0, 0);
  mesh.position.set(0, offsetY, offsetZ);
  mesh.renderOrder = 48;
  mesh.frustumCulled = false;
  return mesh;
};
