export interface PhotoDNAHints {
  dominantRgb: { r: number; g: number; b: number };
  dominantHue: number;
  saturation: number;
  meanLuminance: number;
  contrast: number;
  warmness: number;
}

const TARGET_SIZE = 64;
const SAMPLE_LIMIT = 900;
const KMEANS_K = 3;
const KMEANS_ITERS = 7;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const rgbToHsl = (r: number, g: number, b: number) => {
  const rr = clamp01(r / 255);
  const gg = clamp01(g / 255);
  const bb = clamp01(b / 255);
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = ((bb - rr) / delta) + 2;
    else h = ((rr - gg) / delta) + 4;
  }

  h *= 60;
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs((2 * l) - 1));
  return { h, s, l };
};

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });

const samplePixels = (rgba: Uint8ClampedArray): Array<[number, number, number]> => {
  const pixels: Array<[number, number, number]> = [];
  const stride = Math.max(1, Math.floor((rgba.length / 4) / SAMPLE_LIMIT));
  for (let i = 0; i < rgba.length; i += (4 * stride)) {
    const a = rgba[i + 3];
    if (a < 220) continue;
    pixels.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  return pixels;
};

const squaredDistance = (a: [number, number, number], b: [number, number, number]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (dr * dr) + (dg * dg) + (db * db);
};

const runKMeans = (samples: Array<[number, number, number]>) => {
  if (samples.length === 0) {
    return {
      dominant: [127, 127, 127] as [number, number, number],
      assignments: [] as number[],
    };
  }

  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < KMEANS_K; i += 1) {
    const idx = Math.floor(((i + 1) * samples.length) / (KMEANS_K + 1));
    centroids.push(samples[Math.min(samples.length - 1, idx)]);
  }

  const assignments = new Array<number>(samples.length).fill(0);
  for (let iter = 0; iter < KMEANS_ITERS; iter += 1) {
    const sums = new Array(KMEANS_K).fill(null).map(() => ({
      r: 0,
      g: 0,
      b: 0,
      count: 0,
    }));

    for (let i = 0; i < samples.length; i += 1) {
      const pixel = samples[i];
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < KMEANS_K; c += 1) {
        const dist = squaredDistance(pixel, centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      assignments[i] = best;
      sums[best].r += pixel[0];
      sums[best].g += pixel[1];
      sums[best].b += pixel[2];
      sums[best].count += 1;
    }

    for (let c = 0; c < KMEANS_K; c += 1) {
      const bucket = sums[c];
      if (bucket.count === 0) {
        centroids[c] = samples[(iter + c) % samples.length];
        continue;
      }
      centroids[c] = [
        Math.round(bucket.r / bucket.count),
        Math.round(bucket.g / bucket.count),
        Math.round(bucket.b / bucket.count),
      ];
    }
  }

  const counts = new Array(KMEANS_K).fill(0);
  for (let i = 0; i < assignments.length; i += 1) {
    counts[assignments[i]] += 1;
  }
  let dominantCluster = 0;
  for (let i = 1; i < counts.length; i += 1) {
    if (counts[i] > counts[dominantCluster]) dominantCluster = i;
  }

  return {
    dominant: centroids[dominantCluster],
    assignments,
  };
};

export const analyzePhotoForDNA = async (faceImageBase64?: string): Promise<PhotoDNAHints | null> => {
  if (!faceImageBase64) return null;
  try {
    const img = await loadImageFromDataUrl(faceImageBase64);
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const cropSide = Math.max(8, Math.floor(side * 0.72));
    const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - cropSide) / 2));
    const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - cropSide) / 2));
    ctx.drawImage(img, sx, sy, cropSide, cropSide, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const imageData = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
    const samples = samplePixels(imageData.data);
    if (samples.length < 20) return null;

    const { dominant } = runKMeans(samples);
    const hsl = rgbToHsl(dominant[0], dominant[1], dominant[2]);

    let lumSum = 0;
    let warmSum = 0;
    const lums: number[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      const [r, g, b] = samples[i];
      const lum = ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) / 255;
      lumSum += lum;
      warmSum += (r - b) / 255;
      lums.push(lum);
    }
    const meanLum = lumSum / samples.length;
    let variance = 0;
    for (let i = 0; i < lums.length; i += 1) {
      const diff = lums[i] - meanLum;
      variance += diff * diff;
    }
    const contrast = Math.sqrt(variance / lums.length);

    return {
      dominantRgb: { r: dominant[0], g: dominant[1], b: dominant[2] },
      dominantHue: hsl.h,
      saturation: hsl.s,
      meanLuminance: meanLum,
      contrast,
      warmness: warmSum / samples.length,
    };
  } catch {
    return null;
  }
};
