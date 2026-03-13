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
  const texture = slot.sourceImageUrl ? await new THREE.TextureLoader().loadAsync(slot.sourceImageUrl) : null;
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
    };

    const sync = async () => {
      const desired = new Set(attachments.map((slot) => slot.mountPoint));
      (Array.from(mountedRef.current.keys()) as MountPointId[])
        .filter((mountPoint) => !desired.has(mountPoint))
        .forEach(clearMount);

      for (const slot of attachments) {
        const mountNode = mountNodes[slot.mountPoint];
        if (!mountNode) continue;
        clearMount(slot.mountPoint);

        let record: AttachmentRecord;
        try {
          const gltf = await loader.loadAsync(slot.glbUrl);
          if (disposed) return;
          const scene = gltf.scene.clone(true);
          normalizeEquipmentGlb(scene, 0.24 * (slot.scale || 1));
          record = {
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
        } catch {
          record = await createImageFallbackAttachment(slot);
          if (disposed) {
            record.dispose();
            return;
          }
        }

        mountNode.add(record.root);
        mountedRef.current.set(slot.mountPoint, record);
        setVersion((v) => v + 1);
      }
    };

    void sync();

    return () => {
      disposed = true;
      (Array.from(mountedRef.current.keys()) as MountPointId[]).forEach(clearMount);
    };
  }, [attachments, heroScene]);

  return version;
};
