import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { collectCharacterClips } from '../../utils/characterAnimation';
import { ROOT_DRIVE_BONE_RE } from './constants';

type LoadedGLTF = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

const stripRootPositionTracks = (clips: THREE.AnimationClip[]): THREE.AnimationClip[] =>
  clips.map((clip) => {
    const sanitized = clip.clone();
    // Gameplay owns locomotion, so root position tracks only introduce foot floating.
    sanitized.tracks = sanitized.tracks.filter((track) => {
      const name = String(track.name || '').toLowerCase();
      if (!name.endsWith('.position')) return true;
      return !ROOT_DRIVE_BONE_RE.test(name);
    });
    return sanitized;
  });

export const useRobotAssetBundle = (modelType: 'A' | 'B') => {
  const [heroScene, setHeroScene] = useState<THREE.Group | null>(null);
  const [heroAnimations, setHeroAnimations] = useState<THREE.AnimationClip[]>([]);
  const [heroBaseMinY, setHeroBaseMinY] = useState<number | null>(null);
  const heroModelUrl = `/models/${modelType}/Character_output.glb`;
  const fallbackModelUrl = `/models/${modelType === 'A' ? 'B' : 'A'}/Character_output.glb`;

  useEffect(() => {
    let disposed = false;
    const loader = new GLTFLoader();
    const sharedAnimationsUrl = '/animations/shared_animations.glb';
    const loadAsync = (url: string) =>
      new Promise<LoadedGLTF>((resolve, reject) => {
        loader.load(url, (gltf) => resolve(gltf as LoadedGLTF), undefined, reject);
      });

    const loadBaseWithFallback = async (): Promise<{ gltf: LoadedGLTF; loadedUrl: string }> => {
      try {
        return { gltf: await loadAsync(heroModelUrl), loadedUrl: heroModelUrl };
      } catch (primaryErr) {
        console.warn(
          '[RobotCharacter] hero GLB load failed, trying fallback:',
          heroModelUrl,
          primaryErr,
        );
        return { gltf: await loadAsync(fallbackModelUrl), loadedUrl: fallbackModelUrl };
      }
    };

    const run = async () => {
      try {
        const { gltf: baseGltf, loadedUrl } = await loadBaseWithFallback();
        if (disposed) return;

        const scene = cloneSkeleton(baseGltf.scene) as THREE.Group;
        scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
        });

        const bounds = new THREE.Box3().setFromObject(scene);
        const minY = Number.isFinite(bounds.min.y) ? bounds.min.y : null;
        setHeroScene(scene);
        setHeroBaseMinY(minY);

        let animationSource = baseGltf.animations;
        try {
          const animGltf = await loadAsync(sharedAnimationsUrl);
          animationSource = animGltf.animations?.length ? animGltf.animations : animationSource;
        } catch (animErr) {
          console.warn(
            '[RobotCharacter] shared animation GLB load failed; using base clips',
            animErr,
          );
        }
        if (disposed) return;

        setHeroAnimations(stripRootPositionTracks(collectCharacterClips(animationSource)));
        console.info('[RobotCharacter] hero GLB loaded:', loadedUrl);
      } catch (err) {
        if (disposed) return;
        setHeroScene(null);
        setHeroAnimations([]);
        setHeroBaseMinY(null);
        console.warn('[RobotCharacter] hero GLB load failed:', err);
      }
    };

    run();
    return () => {
      disposed = true;
    };
  }, [fallbackModelUrl, heroModelUrl]);

  useEffect(
    () => () => {
      if (!heroScene) return;
      heroScene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose?.();
      });
    },
    [heroScene],
  );

  return { heroAnimations, heroBaseMinY, heroScene };
};
