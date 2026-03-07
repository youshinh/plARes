import { useCallback } from 'react';

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

const loadImageElement = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('face_texture_image_load_failed'));
    image.src = dataUrl;
  });

const compressDataUrl = async (dataUrl: string): Promise<string> => {
  if (typeof window === 'undefined') return dataUrl;
  const image = await loadImageElement(dataUrl);

  const ratio = Math.min(1, MAX_EDGE / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round((image.width || 1) * ratio));
  const height = Math.max(1, Math.round((image.height || 1) * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

export const useFaceTexture = () => {
  const createFaceTexture = useCallback(async (faceImageBase64?: string | null) => {
    if (!faceImageBase64) return '';
    try {
      return await compressDataUrl(faceImageBase64);
    } catch {
      return faceImageBase64;
    }
  }, []);

  return { createFaceTexture };
};
