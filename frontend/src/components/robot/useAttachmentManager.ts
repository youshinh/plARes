import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AttachmentSlot, MountPointId } from './constants';
import { injectMountPoints } from '../../utils/mountPointInjector';
import { normalizeEquipmentGlb } from '../../utils/equipmentNormalizer';

type AttachmentRecord = {
  root: THREE.Object3D;
  dispose: () => void;
};

const createImageFallbackAttachment = async (slot: AttachmentSlot): Promise<AttachmentRecord> => {
  const group = new THREE.Group();
  let fetchUrl = slot.sourceImageUrl || '';
  if (fetchUrl.startsWith('https://assets.meshy.ai/')) {
    fetchUrl = fetchUrl.replace('https://assets.meshy.ai/', '/meshy-assets/');
  }
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const texture = fetchUrl ? await loader.loadAsync(fetchUrl) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), material);
  mesh.rotation.y = Math.PI / 2;
  group.add(mesh);
  group.scale.setScalar(slot.scale || 1);
  return {
    root: group,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
};

export const useAttachmentManager = (
  heroScene: THREE.Group | null,
  attachments: AttachmentSlot[],
) => {
  const mountedRef = useRef(new Map<MountPointId, AttachmentRecord>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!heroScene) return;
    const mountNodes = injectMountPoints(heroScene);
    const loader = new GLTFLoader();
    let disposed = false;

    const clearMount = (mountPoint: MountPointId) => {
      const record = mountedRef.current.get(mountPoint);
      if (!record) return;
      record.root.removeFromParent();
      record.dispose();
      mountedRef.current.delete(mountPoint);
      // Trigger cache rebuild on removal to prevent memory leak of old materials
      setVersion((v) => v + 1);
    };

    const sync = async () => {
      const desired = new Set(attachments.map((slot) => slot.mountPoint));
      (Array.from(mountedRef.current.keys()) as MountPointId[])
        .filter((mountPoint) => !desired.has(mountPoint))
        .forEach(clearMount);

      const results = await Promise.all(
        attachments.map(async (slot) => {
          const mountNode = mountNodes[slot.mountPoint];
          if (!mountNode) return null;

          try {
            let fetchUrl = slot.glbUrl;
            if (fetchUrl.startsWith('https://assets.meshy.ai/')) {
              fetchUrl = fetchUrl.replace('https://assets.meshy.ai/', '/meshy-assets/');
            }
            const gltf = await loader.loadAsync(fetchUrl);
            if (disposed) return null;
            const scene = gltf.scene.clone(true);
            normalizeEquipmentGlb(scene, 0.24 * (slot.scale || 1));
            const record: AttachmentRecord = {
              root: scene,
              dispose: () => {
                scene.traverse((node) => {
                  const mesh = node as THREE.Mesh;
                  if (!mesh.isMesh) return;
                  mesh.geometry?.dispose?.();
                  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                  mats.forEach((material) => material?.dispose?.());
                });
              },
            };
            return { slot, record, mountNode };
          } catch {
            const record = await createImageFallbackAttachment(slot);
            if (disposed) {
              record.dispose();
              return null;
            }
            return { slot, record, mountNode };
          }
        }),
      );

      if (disposed) {
        results.forEach((res) => res?.record.dispose());
        return;
      }

      results.forEach((res) => {
        if (!res) return;
        const { slot, record, mountNode } = res;
        clearMount(slot.mountPoint);
        mountNode.add(record.root);
        mountedRef.current.set(slot.mountPoint, record);
      });
      setVersion((v) => v + 1);
    };

    void sync();

    return () => {
      disposed = true;
      const keys = Array.from(mountedRef.current.keys()) as MountPointId[];
      keys.forEach(clearMount);
    };
  }, [attachments, heroScene]);

  return { attachmentVersion: version };
};
