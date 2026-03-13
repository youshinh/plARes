import { useCallback } from 'react';

const MAX_EDGE = 1024;

const loadImageElement = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('face_texture_image_load_failed'));
    image.src = dataUrl;
  });

/**
 * Remove chroma-key green (#00FF00) pixels from a canvas, making them transparent.
 * Uses a tolerance range so near-green pixels are also removed, keeping face edges clean.
 */
const removeGreenBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Chroma-key threshold: green channel must dominate both r and b significantly.
    // This targets #00FF00 and nearby variants while preserving skin tones.
    const isGreen =
      g > 100 &&           // significant green
      g > r * 1.6 &&       // green dominates red
      g > b * 1.6 &&       // green dominates blue
      r < 100 &&           // red channel low
      b < 100;             // blue channel low

    if (isGreen) {
      // Soft edge: alpha proportional to how "green" the pixel is, inverted.
      const greenness = Math.min(1, (g - Math.max(r, b)) / 128);
      data[i + 3] = Math.round(data[i + 3] * (1 - greenness));
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

const processDataUrl = async (dataUrl: string): Promise<string> => {
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

  // Remove chroma-key green background → transparent face texture.
  removeGreenBackground(context, width, height);

  // Export as PNG to preserve the alpha channel transparency.
  return canvas.toDataURL('image/png');
};

export const useFaceTexture = () => {
  const createFaceTexture = useCallback(async (faceImageBase64?: string | null) => {
    if (!faceImageBase64) return '';
    try {
      return await processDataUrl(faceImageBase64);
    } catch {
      return faceImageBase64;
    }
  }, []);

  return { createFaceTexture };
};
