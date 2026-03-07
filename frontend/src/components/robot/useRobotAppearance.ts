import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import type { ModelTypeId } from '../../constants/modelTypes';
import {
  getFinishMaterialTuning,
  getSilhouetteScales,
  resolveRobotPalette,
} from '../../utils/characterDNA';
import { createSurfaceMaps, disposeSurfaceMaps } from '../../utils/proceduralPBR';
import { GROUND_CONTACT_BIAS } from './constants';

type UseRobotAppearanceArgs = {
  heroBaseMinY: number | null;
  heroScene: THREE.Group | null;
  modelType: ModelTypeId;
  robotDna: CharacterDNA;
  robotMaterial: string;
  vit: number;
};

export const useRobotAppearance = ({
  heroBaseMinY,
  heroScene,
  modelType,
  robotDna,
  robotMaterial,
  vit,
}: UseRobotAppearanceArgs) => {
  const palette = useMemo(
    () => resolveRobotPalette(robotMaterial, robotDna),
    [robotDna, robotMaterial],
  );
  const finishTuning = useMemo(
    () => getFinishMaterialTuning(robotDna.finish),
    [robotDna.finish],
  );
  const bodyScale = useMemo(() => getSilhouetteScales(robotDna).body, [robotDna]);
  const dnaGlowIntensity = Math.max(0.9, Math.min(1.8, robotDna.glowIntensity || 1.0));
  const scarRoughnessBoost = (robotDna.scarLevel || 0) * 0.035;
  const heroScale = 0.62 + ((vit / 99) * 0.08);
  const heroOffsetY =
    (heroBaseMinY !== null ? (-heroBaseMinY * heroScale) : 0) + GROUND_CONTACT_BIAS;

  const surfaceMaps = useMemo(() => {
    if (typeof document === 'undefined') {
      return { white: null, blue: null, dark: null };
    }
    return {
      white: createSurfaceMaps({
        seed: robotDna.seed ^ 0x17A3,
        baseColor: palette.white,
        lineColor: palette.silver,
        grimeColor: palette.black,
        emissiveColor: palette.cyan,
      }),
      blue: createSurfaceMaps({
        seed: robotDna.seed ^ 0x2B19,
        baseColor: palette.blue,
        lineColor: palette.blueL,
        grimeColor: palette.blackM,
        emissiveColor: palette.cyan,
      }),
      dark: createSurfaceMaps({
        seed: robotDna.seed ^ 0x4C21,
        baseColor: palette.black,
        lineColor: palette.panel,
        grimeColor: '#10141A',
        emissiveColor: palette.cyan,
      }),
    };
  }, [palette, robotDna.seed]);

  useEffect(
    () => () => {
      disposeSurfaceMaps(surfaceMaps.white);
      disposeSurfaceMaps(surfaceMaps.blue);
      disposeSurfaceMaps(surfaceMaps.dark);
    },
    [surfaceMaps],
  );

  const withMaps = useCallback(
    (key: 'white' | 'blue' | 'dark') => {
      const maps = surfaceMaps[key];
      return maps
        ? {
            map: maps.albedo,
            roughnessMap: maps.roughness,
            metalnessMap: maps.metalness,
            emissiveMap: maps.emissive,
          }
        : {};
    },
    [surfaceMaps],
  );

  const [skinTex, setSkinTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    if (!robotDna.skinUrl) {
      setSkinTex(null);
      return () => {
        active = false;
      };
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      robotDna.skinUrl,
      (tex) => {
        if (!active) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        setSkinTex(tex);
      },
      undefined,
      () => {
        if (!active) return;
        setSkinTex(null);
      },
    );

    return () => {
      active = false;
    };
  }, [robotDna.skinUrl]);

  useEffect(
    () => () => {
      skinTex?.dispose();
    },
    [skinTex],
  );

  useEffect(() => {
    if (!heroScene) return;

    const roughBias = finishTuning.roughnessBias;
    const metalBias = finishTuning.metalBias;
    const primaryBodyColor = modelType === 'B' ? palette.red : palette.blue;
    const secondaryBodyColor = modelType === 'B' ? palette.yellow : palette.white;
    const accentEmissiveColor = modelType === 'B' ? palette.redD : palette.blueL;
    const visorGlowColor = modelType === 'B' ? palette.yellow : palette.cyan;
    const applyRough = (value: number) =>
      Math.max(0.02, Math.min(0.98, value + roughBias));
    const applyMetal = (value: number) =>
      Math.max(0.0, Math.min(1.0, value + metalBias));
    const buildHeroMat = (params: THREE.MeshPhysicalMaterialParameters) => {
      const material = new THREE.MeshPhysicalMaterial(params);
      ((material as unknown) as { skinning?: boolean }).skinning = true;
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.depthTest = true;
      material.blending = THREE.NormalBlending;
      material.transmission = 0;
      return material;
    };

    const whiteMaps = withMaps('white');
    const blueMaps = withMaps('blue');
    const darkMaps = withMaps('dark');
    const mats = [
      buildHeroMat({
        color: skinTex ? 0xffffff : primaryBodyColor,
        map: skinTex || blueMaps.map,
        roughnessMap: blueMaps.roughnessMap,
        metalnessMap: blueMaps.metalnessMap,
        emissiveMap: blueMaps.emissiveMap,
        roughness: applyRough(0.34),
        metalness: applyMetal(0.58),
        emissive: new THREE.Color(accentEmissiveColor),
        emissiveIntensity: 0.06,
        clearcoat: 0.22,
        clearcoatRoughness: 0.34,
      }),
      buildHeroMat({
        color: skinTex ? 0xffffff : secondaryBodyColor,
        map: skinTex || whiteMaps.map,
        roughnessMap: whiteMaps.roughnessMap,
        metalnessMap: whiteMaps.metalnessMap,
        emissiveMap: whiteMaps.emissiveMap,
        roughness: applyRough(0.28),
        metalness: applyMetal(0.45),
        emissive: new THREE.Color(palette.whiteB),
        emissiveIntensity: 0.04,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
      buildHeroMat({
        color: skinTex ? 0xffffff : palette.black,
        map: skinTex || darkMaps.map,
        roughnessMap: darkMaps.roughnessMap,
        metalnessMap: darkMaps.metalnessMap,
        emissiveMap: darkMaps.emissiveMap,
        roughness: applyRough(0.56),
        metalness: applyMetal(0.62),
        emissive: new THREE.Color(palette.blackM),
        emissiveIntensity: 0.03,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
      buildHeroMat({
        color: visorGlowColor,
        emissive: new THREE.Color(visorGlowColor),
        emissiveMap: surfaceMaps.blue?.emissive,
        emissiveIntensity: Math.max(0.9, dnaGlowIntensity),
        roughness: applyRough(0.08),
        metalness: applyMetal(0.82),
        transmission: 0,
        thickness: 0.5,
        ior: 1.23,
        clearcoat: 0.82,
        clearcoatRoughness: 0.06,
      }),
    ];

    let idx = 0;
    heroScene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.material = mats[idx % mats.length];
      idx += 1;
    });

    return () => {
      mats.forEach((material) => material.dispose());
    };
  }, [dnaGlowIntensity, finishTuning, heroScene, modelType, palette, skinTex, surfaceMaps, withMaps]);

  return {
    bodyScale,
    heroOffsetY,
    heroScale,
    scarRoughnessBoost,
  };
};
