import * as THREE from 'three';

type ColorRgb = { r: number; g: number; b: number };

export interface SurfaceMaps {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
  metalness: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
}

interface CreateSurfaceMapsInput {
  seed: number;
  baseColor: string;
  lineColor: string;
  grimeColor: string;
  emissiveColor: string;
  size?: number;
}

const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const parseHex = (hex: string): ColorRgb => {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return { r: 200, g: 200, b: 200 };
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return {
    r: Number.isFinite(r) ? r : 200,
    g: Number.isFinite(g) ? g : 200,
    b: Number.isFinite(b) ? b : 200,
  };
};

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const makeTexture = (
  size: number,
  draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void,
  seed: number,
): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  draw(ctx, mulberry32(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.4, 1.4);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

export const createSurfaceMaps = ({
  seed,
  baseColor,
  lineColor,
  grimeColor,
  emissiveColor,
  size = 512,
}: CreateSurfaceMapsInput): SurfaceMaps => {
  const base = parseHex(baseColor);
  const line = parseHex(lineColor);
  const grime = parseHex(grimeColor);
  const glow = parseHex(emissiveColor);

  const albedo = makeTexture(size, (ctx, rand) => {
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, `rgb(${base.r}, ${base.g}, ${base.b})`);
    grad.addColorStop(1, `rgb(${clamp255(base.r - 22)}, ${clamp255(base.g - 22)}, ${clamp255(base.b - 22)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = `rgba(${line.r}, ${line.g}, ${line.b}, 0.44)`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i += 1) {
      const x = 8 + (i * 30) + Math.floor(rand() * 8);
      const y = 6 + ((i * 41) % (size - 80));
      const w = 72 + Math.floor(rand() * 20);
      const h = 42 + Math.floor(rand() * 18);
      ctx.strokeRect(x % (size - w), y, w, h);
    }

    for (let i = 0; i < 220; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 1 + rand() * 3;
      const h = 1 + rand() * 3;
      ctx.fillStyle = `rgba(${grime.r}, ${grime.g}, ${grime.b}, ${0.05 + (rand() * 0.1)})`;
      ctx.fillRect(x, y, w, h);
    }

    for (let i = 0; i < 24; i += 1) {
      const y = i * (size / 24);
      ctx.strokeStyle = `rgba(${clamp255(line.r + 10)}, ${clamp255(line.g + 10)}, ${clamp255(line.b + 10)}, 0.12)`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + ((i % 2 === 0) ? 2 : -2));
      ctx.stroke();
    }
  }, seed ^ 0xACE1);

  const roughness = makeTexture(size, (ctx, rand) => {
    ctx.fillStyle = '#6F6F6F';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4800; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const l = clamp255(88 + (rand() * 110));
      ctx.fillStyle = `rgb(${l}, ${l}, ${l})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.strokeStyle = 'rgba(38,38,38,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      ctx.strokeRect(14 + (i * 38), 10 + ((i * 53) % (size - 90)), 92, 48);
    }
  }, seed ^ 0x9E37);
  roughness.colorSpace = THREE.NoColorSpace;

  const metalness = makeTexture(size, (ctx, rand) => {
    ctx.fillStyle = '#B5B5B5';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const l = clamp255(140 + (rand() * 100));
      ctx.fillStyle = `rgb(${l}, ${l}, ${l})`;
      ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
    }
    ctx.strokeStyle = 'rgba(70,70,70,0.2)';
    for (let i = 0; i < 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, i * 48 + 6);
      ctx.lineTo(size, i * 48 + 9);
      ctx.stroke();
    }
  }, seed ^ 0x44AF);
  metalness.colorSpace = THREE.NoColorSpace;

  const emissive = makeTexture(size, (ctx, rand) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = `rgba(${glow.r}, ${glow.g}, ${glow.b}, 0.35)`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 22; i += 1) {
      const y = i * (size / 22);
      ctx.beginPath();
      ctx.moveTo(0, y + ((i % 3) - 1));
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    for (let i = 0; i < 35; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const radius = 1.2 + rand() * 2.4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.6);
      g.addColorStop(0, `rgba(${glow.r}, ${glow.g}, ${glow.b}, 0.65)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, seed ^ 0x1705);

  return { albedo, roughness, metalness, emissive };
};

export const disposeSurfaceMaps = (maps: SurfaceMaps | null | undefined) => {
  if (!maps) return;
  maps.albedo.dispose();
  maps.roughness.dispose();
  maps.metalness.dispose();
  maps.emissive.dispose();
};
