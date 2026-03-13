import * as THREE from 'three';

type SupportedMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

type DepthOcclusionUniforms = {
  uDepthTex: { value: THREE.Texture | null };
  uDepthRawToMeters: { value: number };
  uDepthBiasMeters: { value: number };
  uDepthEnabled: { value: number };
  uViewport: { value: THREE.Vector2 };
  uCameraNear: { value: number };
  uCameraFar: { value: number };
};

const isSupportedMaterial = (material: THREE.Material): material is SupportedMaterial =>
  material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial;

export const patchDepthOcclusionMaterial = (material: THREE.Material): material is SupportedMaterial => {
  if (!isSupportedMaterial(material)) return false;
  if ((material.userData as { depthOcclusionPatched?: boolean }).depthOcclusionPatched) return true;

  const prevOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prevOnBeforeCompile?.(shader, renderer);

    shader.uniforms.uDepthTex = { value: null };
    shader.uniforms.uDepthRawToMeters = { value: 0.001 };
    shader.uniforms.uDepthBiasMeters = { value: 0.04 };
    shader.uniforms.uDepthEnabled = { value: 0.0 };
    shader.uniforms.uViewport = { value: new THREE.Vector2(1, 1) };
    shader.uniforms.uCameraNear = { value: 0.1 };
    shader.uniforms.uCameraFar = { value: 100.0 };

    shader.fragmentShader = `
uniform sampler2D uDepthTex;
uniform float uDepthRawToMeters;
uniform float uDepthBiasMeters;
uniform float uDepthEnabled;
uniform vec2 uViewport;
uniform float uCameraNear;
uniform float uCameraFar;
${shader.fragmentShader}
`;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  if (uDepthEnabled > 0.5) {
  vec2 depthUv = vec2(
    gl_FragCoord.x / max(uViewport.x, 1.0),
    1.0 - (gl_FragCoord.y / max(uViewport.y, 1.0))
  );
  float rawDepth = texture2D(uDepthTex, depthUv).r;
  float realDepthMeters = rawDepth * uDepthRawToMeters;
  if (realDepthMeters > 0.01) {
    float zNdc = (gl_FragCoord.z * 2.0) - 1.0;
    float virtualDepthMeters =
      (2.0 * uCameraNear * uCameraFar) /
      max((uCameraFar + uCameraNear) - (zNdc * (uCameraFar - uCameraNear)), 0.0001);
    if (virtualDepthMeters > realDepthMeters + uDepthBiasMeters) {
      discard;
    }
  }
}`,
    );

    (material.userData as { depthOcclusionUniforms?: DepthOcclusionUniforms }).depthOcclusionUniforms =
      shader.uniforms as DepthOcclusionUniforms;
  };

  (material.userData as { depthOcclusionPatched?: boolean }).depthOcclusionPatched = true;
  material.needsUpdate = true;
  return true;
};

export const updateDepthOcclusionUniforms = (
  material: SupportedMaterial,
  params: {
    depthTexture: THREE.Texture | null;
    depthRawToMeters: number | null;
    viewportWidth: number;
    viewportHeight: number;
    cameraNear: number;
    cameraFar: number;
  },
) => {
  const uniforms = (material.userData as { depthOcclusionUniforms?: DepthOcclusionUniforms }).depthOcclusionUniforms;
  if (!uniforms) return;

  const enabled =
    !!params.depthTexture &&
    !!params.depthRawToMeters &&
    params.depthRawToMeters > 0 &&
    params.viewportWidth > 0 &&
    params.viewportHeight > 0;

  uniforms.uDepthEnabled.value = enabled ? 1.0 : 0.0;
  uniforms.uDepthTex.value = enabled ? params.depthTexture : null;
  uniforms.uDepthRawToMeters.value = enabled ? Number(params.depthRawToMeters) : 0.001;
  uniforms.uDepthBiasMeters.value = 0.04;
  uniforms.uViewport.value.set(params.viewportWidth, params.viewportHeight);
  uniforms.uCameraNear.value = Number.isFinite(params.cameraNear) ? params.cameraNear : 0.1;
  uniforms.uCameraFar.value = Number.isFinite(params.cameraFar) ? params.cameraFar : 100.0;
};
