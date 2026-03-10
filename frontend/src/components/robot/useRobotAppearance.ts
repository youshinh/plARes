import { useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import { getModelTypeMeta, isHeavyModelType, type ModelTypeId } from '../../constants/modelTypes';
import {
  getFinishMaterialTuning,
  getSilhouetteScales,
  MATERIAL_PBR_TUNING,
  resolveRobotPalette,
} from '../../utils/characterDNA';
import {
  createFaceDecal,
  createHeadProjectionMaterial,
  findFaceDecalAnchor,
  isHeadProjectionTarget,
} from '../../utils/headProjectionMaterial';
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
  const paletteMaterial = getModelTypeMeta(modelType).material ?? robotMaterial;
  const palette = useMemo(
    () => resolveRobotPalette(paletteMaterial, robotDna),
    [paletteMaterial, robotDna],
  );
  const finishTuning = useMemo(
    () => getFinishMaterialTuning(robotDna.finish),
    [robotDna.finish],
  );
  const materialPbrTuning = useMemo(
    () => MATERIAL_PBR_TUNING[paletteMaterial],
    [paletteMaterial],
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

    const applyChromaKey = (loadedTex: THREE.Texture): THREE.Texture => {
      try {
        const img = loadedTex.image as HTMLImageElement | null;
        if (!img || !img.width) return loadedTex;

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return loadedTex;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          // Match chroma-key green: g dominates r and b significantly
          if (g > 80 && g > r * 1.5 && g > b * 1.5 && r < 160 && b < 160) {
            const greenness = Math.min(1, (g - Math.max(r, b)) / 100);
            d[i + 3] = Math.round(d[i + 3] * (1 - greenness));
          }
        }
        ctx.putImageData(imageData, 0, 0);
        loadedTex.dispose();

        const canvasTex = new THREE.CanvasTexture(canvas);
        canvasTex.colorSpace = THREE.SRGBColorSpace;
        canvasTex.flipY = false;
        return canvasTex;
      } catch {
        return loadedTex;
      }
    };

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
        const finalTex = applyChromaKey(tex);
        setSkinTex(finalTex);
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
    const useHeavyPalette = isHeavyModelType(modelType);
    const primaryBodyColor = useHeavyPalette ? palette.red : palette.blue;
    const secondaryBodyColor = useHeavyPalette ? palette.yellow : palette.white;
    const accentEmissiveColor = useHeavyPalette ? palette.redD : palette.blueL;
    const visorGlowColor = useHeavyPalette ? palette.yellow : palette.cyan;
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
    const baseMats = [
      buildHeroMat({
        color: primaryBodyColor,
        map: blueMaps.map,
        roughnessMap: blueMaps.roughnessMap,
        metalnessMap: blueMaps.metalnessMap,
        emissiveMap: blueMaps.emissiveMap,
        roughness: applyRough(materialPbrTuning.roughnessBase + 0.04),
        metalness: applyMetal(materialPbrTuning.metalnessBase + 0.08),
        emissive: new THREE.Color(accentEmissiveColor),
        emissiveIntensity: 0.06,
        clearcoat: materialPbrTuning.clearcoat,
        clearcoatRoughness: 0.34,
      }),
      buildHeroMat({
        color: secondaryBodyColor,
        map: whiteMaps.map,
        roughnessMap: whiteMaps.roughnessMap,
        metalnessMap: whiteMaps.metalnessMap,
        emissiveMap: whiteMaps.emissiveMap,
        roughness: applyRough(materialPbrTuning.roughnessBase),
        metalness: applyMetal(materialPbrTuning.metalnessBase),
        emissive: new THREE.Color(palette.whiteB),
        emissiveIntensity: 0.04,
        clearcoat: Math.max(0.2, materialPbrTuning.clearcoat),
        clearcoatRoughness: 0.2,
      }),
      buildHeroMat({
        color: palette.black,
        map: darkMaps.map,
        roughnessMap: darkMaps.roughnessMap,
        metalnessMap: darkMaps.metalnessMap,
        emissiveMap: darkMaps.emissiveMap,
        roughness: applyRough(materialPbrTuning.roughnessBase + 0.18),
        metalness: applyMetal(materialPbrTuning.metalnessBase + 0.12),
        emissive: new THREE.Color(palette.blackM),
        emissiveIntensity: 0.03,
        clearcoat: Math.max(0.08, materialPbrTuning.clearcoat * 0.4),
        clearcoatRoughness: 0.5,
      }),
      buildHeroMat({
        color: visorGlowColor,
        emissive: new THREE.Color(visorGlowColor),
        emissiveMap: surfaceMaps.blue?.emissive,
        emissiveIntensity: Math.max(0.9, dnaGlowIntensity),
        roughness: applyRough(Math.max(0.04, materialPbrTuning.roughnessBase - 0.1)),
        metalness: applyMetal(Math.max(0.4, materialPbrTuning.metalnessBase)),
        transmission: 0,
        thickness: 0.5,
        ior: 1.23,
        clearcoat: Math.max(0.6, materialPbrTuning.clearcoat),
        clearcoatRoughness: 0.06,
      }),
    ];
    const headMat = skinTex ? createHeadProjectionMaterial(skinTex, accentEmissiveColor) : null;
    let faceDecal: THREE.Object3D | null = null;

    let idx = 0;
    let appliedHeadProjection = false;
    heroScene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      if (headMat && isHeadProjectionTarget(mesh.name)) {
        mesh.material = headMat;
        appliedHeadProjection = true;
      } else {
        mesh.material = baseMats[idx % baseMats.length];
      }
      idx += 1;
    });

    if (headMat && !appliedHeadProjection) {
      const anchor = findFaceDecalAnchor(heroScene);
      if (anchor) {
        const heavyFrame = isHeavyModelType(modelType);
        const isHeadFrontAnchor = /headfront/i.test(anchor.name);
        faceDecal = createFaceDecal(skinTex!, {
          radius: heavyFrame ? 9.6 : 7.2,
          offsetZ: isHeadFrontAnchor ? 0 : 1.2,
          offsetY: /neck/i.test(anchor.name) ? 7.2 : 0.1,
        });
        anchor.add(faceDecal);
        appliedHeadProjection = true;
      }
    }

    return () => {
      if (faceDecal) {
        faceDecal.parent?.remove(faceDecal);
        const faceMesh = faceDecal as THREE.Mesh;
        (faceMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (faceMesh.material as THREE.MeshBasicMaterial).dispose();
        faceMesh.geometry?.dispose();
      }
      baseMats.forEach((material) => material.dispose());
      headMat?.dispose();
    };
  }, [dnaGlowIntensity, finishTuning, heroScene, materialPbrTuning, modelType, palette, skinTex, surfaceMaps, withMaps]);

  return {
    bodyScale,
    heroOffsetY,
    heroScale,
    scarRoughnessBoost,
  };
};
