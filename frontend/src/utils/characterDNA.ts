import type { PhotoDNAHints } from './photoDNAAnalyzer';
import type { FaceLandmarkHints } from './faceLandmarkAnalyzer';

export type RobotMaterial = 'Wood' | 'Metal' | 'Resin';
export type CharacterSilhouette = 'striker' | 'tank' | 'ace';
export type CharacterFinish = 'matte' | 'satin' | 'gloss';
export type PaletteFamily = 'ember' | 'marine' | 'forest' | 'royal' | 'obsidian' | 'sunset';

export interface CharacterDNA {
  version: 'v1';
  seed: number;
  silhouette: CharacterSilhouette;
  finish: CharacterFinish;
  paletteFamily: PaletteFamily;
  eyeGlow: string;
  scarLevel: number;
  glowIntensity: number;
  evolutionStage: number;
  battlePatina: 'clean' | 'worn' | 'scarred' | 'legend';
  materialType?: string;
  emblemUrl?: string;
}

export interface CharacterDNAInput {
  playerId: string;
  name: string;
  material: RobotMaterial | string;
  tone: string;
  power: number;
  speed: number;
  vit: number;
  faceImageBase64?: string;
  presetText?: string;
  photoHints?: PhotoDNAHints | null;
  landmarkHints?: FaceLandmarkHints | null;
}

export interface RobotPalette {
  white: string;
  whiteB: string;
  blue: string;
  blueL: string;
  red: string;
  redD: string;
  yellow: string;
  black: string;
  blackM: string;
  skin: string;
  cyan: string;
  silver: string;
  panel: string;
}

interface PalettePreset {
  main: string;
  sub: string;
  accent: string;
  accentDark: string;
  joint: string;
  eyeGlow: string;
}

const PALETTE_PRESETS: Record<PaletteFamily, PalettePreset> = {
  ember: {
    main: '#B2562A',
    sub: '#E0B07E',
    accent: '#D43B2E',
    accentDark: '#8D241B',
    joint: '#F5C44E',
    eyeGlow: '#FFB86E',
  },
  marine: {
    main: '#1B5E93',
    sub: '#4F8FC2',
    accent: '#D13A2E',
    accentDark: '#8F241C',
    joint: '#E9C85A',
    eyeGlow: '#73E4FF',
  },
  forest: {
    main: '#2B6A49',
    sub: '#5E9A78',
    accent: '#D39D2E',
    accentDark: '#8E6517',
    joint: '#C7D85C',
    eyeGlow: '#9BFFD2',
  },
  royal: {
    main: '#3E4BAF',
    sub: '#7382D2',
    accent: '#D72C74',
    accentDark: '#8A1C4B',
    joint: '#E6D15E',
    eyeGlow: '#C8C7FF',
  },
  obsidian: {
    main: '#2A323F',
    sub: '#4A5568',
    accent: '#D24A3D',
    accentDark: '#8A2F27',
    joint: '#C2A949',
    eyeGlow: '#95E5FF',
  },
  sunset: {
    main: '#9C4F7C',
    sub: '#C57CA2',
    accent: '#E06A2A',
    accentDark: '#9A441A',
    joint: '#E5C55E',
    eyeGlow: '#FFCAA0',
  },
};

const SILHOUETTE_OPTIONS: CharacterSilhouette[] = ['striker', 'tank', 'ace'];
const FINISH_OPTIONS: CharacterFinish[] = ['matte', 'satin', 'gloss'];
const PALETTE_OPTIONS: PaletteFamily[] = ['ember', 'marine', 'forest', 'royal', 'obsidian', 'sunset'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashFNV1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const createRng = (seed: number) => {
  let value = seed || 0x12345678;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return ((value >>> 0) % 10000) / 10000;
  };
};

const normalizeMaterial = (material: string): RobotMaterial => {
  const raw = (material || '').toLowerCase();
  if (raw === 'metal') return 'Metal';
  if (raw === 'resin') return 'Resin';
  return 'Wood';
};

const pick = <T>(items: T[], rand: () => number): T => {
  const idx = Math.min(items.length - 1, Math.floor(rand() * items.length));
  return items[idx];
};

const getToneLockedPalette = (tone: string): PaletteFamily | null => {
  const toneLower = tone.toLowerCase();
  if (toneLower.includes('熱血') || toneLower.includes('aggressive')) return 'ember';
  if (toneLower.includes('冷静') || toneLower.includes('cool')) return 'marine';
  if (toneLower.includes('関西') || toneLower.includes('fun')) return 'sunset';
  return null;
};

const inferPaletteFromPhotoHints = (hints: PhotoDNAHints): PaletteFamily => {
  const hue = ((hints.dominantHue % 360) + 360) % 360;
  if (hints.saturation < 0.14 && hints.meanLuminance < 0.34) return 'obsidian';
  if (hints.saturation < 0.12 && hints.meanLuminance > 0.62) return 'marine';

  if (hue < 24 || hue >= 338) return 'ember';
  if (hue < 66) return 'sunset';
  if (hue < 162) return 'forest';
  if (hue < 236) return 'marine';
  if (hue < 318) return 'royal';
  return 'ember';
};

export const DEFAULT_CHARACTER_DNA: CharacterDNA = {
  version: 'v1',
  seed: 1024,
  silhouette: 'ace',
  finish: 'satin',
  paletteFamily: 'marine',
  eyeGlow: '#73E4FF',
  scarLevel: 0,
  glowIntensity: 1.0,
  evolutionStage: 0,
  battlePatina: 'clean',
  materialType: 'plastic',
  emblemUrl: '',
};

export const normalizeCharacterDNA = (value: unknown): CharacterDNA | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const version = v.version;
  const seed = v.seed;
  const silhouette = v.silhouette;
  const finish = v.finish;
  const paletteFamily = v.paletteFamily;
  const eyeGlow = v.eyeGlow;
  const scarLevel = v.scarLevel;
  const glowIntensity = v.glowIntensity;
  const evolutionStage = v.evolutionStage;
  const battlePatina = v.battlePatina;
  const materialType = v.materialType;
  const emblemUrl = v.emblemUrl;
  if (
    version !== 'v1' ||
    !isFiniteNumber(seed) ||
    !SILHOUETTE_OPTIONS.includes(silhouette as CharacterSilhouette) ||
    !FINISH_OPTIONS.includes(finish as CharacterFinish) ||
    !PALETTE_OPTIONS.includes(paletteFamily as PaletteFamily) ||
    typeof eyeGlow !== 'string'
  ) {
    return null;
  }
  return {
    version: 'v1',
    seed: Math.max(1, Math.floor(seed)),
    silhouette: silhouette as CharacterSilhouette,
    finish: finish as CharacterFinish,
    paletteFamily: paletteFamily as PaletteFamily,
    eyeGlow,
    scarLevel: isFiniteNumber(scarLevel) ? clampNumber(Math.round(scarLevel), 0, 3) : 0,
    glowIntensity: isFiniteNumber(glowIntensity) ? clampNumber(glowIntensity, 0.8, 1.8) : 1.0,
    evolutionStage: isFiniteNumber(evolutionStage) ? Math.max(0, Math.round(evolutionStage)) : 0,
    battlePatina:
      battlePatina === 'worn' || battlePatina === 'scarred' || battlePatina === 'legend'
        ? battlePatina
        : 'clean',
    materialType: typeof materialType === 'string' ? materialType : 'plastic',
    emblemUrl: typeof emblemUrl === 'string' ? emblemUrl : '',
  };
};

export const buildCharacterDNA = (input: CharacterDNAInput): CharacterDNA => {
  const faceHead = (input.faceImageBase64 || '').slice(0, 512);
  const preset = input.presetText || '';
  const key = [
    input.playerId,
    input.name,
    normalizeMaterial(input.material),
    input.tone,
    String(input.power),
    String(input.speed),
    String(input.vit),
    preset,
    faceHead,
  ].join('|');
  const seed = hashFNV1a(key);
  const rand = createRng(seed);
  const material = normalizeMaterial(input.material);

  let silhouette: CharacterSilhouette = 'ace';
  if (input.power >= input.speed + 12) silhouette = 'tank';
  else if (input.speed >= input.power + 12) silhouette = 'striker';
  if (input.landmarkHints) {
    if (input.landmarkHints.jawWidthRatio >= 0.68) silhouette = 'tank';
    else if (input.landmarkHints.faceAspectRatio >= 0.66 && input.landmarkHints.eyeOpenness >= 0.26) silhouette = 'striker';
  }

  if (rand() > 0.82) silhouette = pick(SILHOUETTE_OPTIONS, rand);

  const finishByMaterial: Record<RobotMaterial, CharacterFinish[]> = {
    Wood: ['matte', 'satin', 'satin'],
    Metal: ['satin', 'gloss', 'gloss'],
    Resin: ['matte', 'satin', 'gloss'],
  };
  let finish = pick(finishByMaterial[material], rand);

  const defaultPaletteByMaterial: Record<RobotMaterial, PaletteFamily[]> = {
    Wood: ['ember', 'forest', 'sunset', 'marine'],
    Metal: ['marine', 'royal', 'obsidian', 'ember'],
    Resin: ['forest', 'marine', 'royal', 'sunset'],
  };
  let paletteFamily = pick(defaultPaletteByMaterial[material], rand);
  const tonePalette = getToneLockedPalette(input.tone);
  if (tonePalette) {
    paletteFamily = tonePalette;
  } else if (input.photoHints) {
    paletteFamily = inferPaletteFromPhotoHints(input.photoHints);
  }

  if (input.photoHints) {
    if (input.photoHints.meanLuminance < 0.28 || input.photoHints.contrast < 0.085) finish = 'matte';
    else if (input.photoHints.contrast > 0.2 && input.photoHints.saturation > 0.22) finish = 'gloss';
  }
  if (input.landmarkHints) {
    const expressiveness = (input.landmarkHints.mouthOpenness * 0.45) + (input.landmarkHints.browEnergy * 0.55);
    if (expressiveness > 0.54) finish = 'gloss';
    else if (expressiveness < 0.22) finish = 'matte';
  }

  return {
    version: 'v1',
    seed,
    silhouette,
    finish,
    paletteFamily,
    eyeGlow: PALETTE_PRESETS[paletteFamily].eyeGlow,
    scarLevel: 0,
    glowIntensity: 1.0,
    evolutionStage: 0,
    battlePatina: 'clean',
    materialType: 'plastic',
    emblemUrl: '',
  };
};

export const refineCharacterDNAWithPhotoHints = (
  base: CharacterDNA,
  hints: PhotoDNAHints | null,
  tone: string,
  landmarkHints?: FaceLandmarkHints | null,
): CharacterDNA => {
  if (!hints && !landmarkHints) return normalizeCharacterDNA(base) ?? DEFAULT_CHARACTER_DNA;
  const tonePalette = getToneLockedPalette(tone);
  const paletteFamily = tonePalette ?? (hints ? inferPaletteFromPhotoHints(hints) : base.paletteFamily);
  let finish = base.finish;
  if (hints) {
    if (hints.meanLuminance < 0.28 || hints.contrast < 0.085) finish = 'matte';
    else if (hints.contrast > 0.2 && hints.saturation > 0.22) finish = 'gloss';
    else finish = 'satin';
  }
  if (landmarkHints) {
    const expressiveness = (landmarkHints.mouthOpenness * 0.45) + (landmarkHints.browEnergy * 0.55);
    if (expressiveness > 0.54) finish = 'gloss';
    else if (expressiveness < 0.22) finish = 'matte';
  }

  const hueSeed = Math.max(1, Math.floor((hints?.dominantHue ?? 180) * 1000));
  const mixedSeed = ((base.seed ^ hueSeed) >>> 0) || base.seed;
  return {
    ...base,
    seed: mixedSeed,
    paletteFamily,
    finish,
    eyeGlow: PALETTE_PRESETS[paletteFamily].eyeGlow,
  };
};

export const evolveCharacterDNAByMatchCount = (
  base: CharacterDNA | null | undefined,
  totalMatches: number,
): CharacterDNA => {
  const normalized = normalizeCharacterDNA(base) ?? DEFAULT_CHARACTER_DNA;
  const stage = Math.max(0, Math.floor(Math.max(0, totalMatches) / 5));
  const scarLevel = clampNumber(stage, 0, 3);
  const glowIntensity = clampNumber(1.0 + (stage * 0.12), 1.0, 1.8);
  let battlePatina: CharacterDNA['battlePatina'] = 'clean';
  if (stage >= 3) battlePatina = 'legend';
  else if (stage >= 2) battlePatina = 'scarred';
  else if (stage >= 1) battlePatina = 'worn';

  return {
    ...normalized,
    evolutionStage: stage,
    scarLevel,
    glowIntensity,
    battlePatina,
  };
};

const mixHex = (a: string, b: string, ratio: number): string => {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };
  const A = parse(a);
  const B = parse(b);
  const mix = (x: number, y: number) => Math.max(0, Math.min(255, Math.round((x * (1 - ratio)) + (y * ratio))));
  const r = mix(A.r, B.r).toString(16).padStart(2, '0');
  const g = mix(A.g, B.g).toString(16).padStart(2, '0');
  const blue = mix(A.b, B.b).toString(16).padStart(2, '0');
  return `#${r}${g}${blue}`.toUpperCase();
};

export const resolveRobotPalette = (material: string, dna: CharacterDNA): RobotPalette => {
  const materialKey = normalizeMaterial(material);
  const preset = PALETTE_PRESETS[dna.paletteFamily] ?? PALETTE_PRESETS.marine;
  const scarFactor = clampNumber(dna.scarLevel * 0.11, 0, 0.33);
  const baseWhite = materialKey === 'Metal' ? '#DDE4EF' : materialKey === 'Wood' ? '#E8DCCF' : '#E5E8EB';
  const baseBlack = materialKey === 'Wood' ? '#2A241F' : '#1C222B';
  const battleBlue = mixHex(preset.main, '#3E2E2B', scarFactor);
  const battleSub = mixHex(preset.sub, '#524946', scarFactor * 0.9);
  const battleAccent = dna.battlePatina === 'legend' ? mixHex(preset.accent, '#F4BA61', 0.2) : mixHex(preset.accent, '#5E2E29', scarFactor * 0.65);
  const battleYellow = dna.battlePatina === 'legend' ? mixHex(preset.joint, '#FFD06A', 0.2) : mixHex(preset.joint, '#8D7C58', scarFactor * 0.5);
  const eyeGlow = dna.battlePatina === 'legend' ? mixHex(preset.eyeGlow, '#FFF1BF', 0.25) : dna.eyeGlow;

  return {
    white: mixHex(baseWhite, '#998B84', scarFactor * 0.95),
    whiteB: mixHex(baseWhite, '#8894A3', 0.18 + (scarFactor * 0.4)),
    blue: battleBlue,
    blueL: battleSub,
    red: battleAccent,
    redD: preset.accentDark,
    yellow: battleYellow,
    black: baseBlack,
    blackM: mixHex(baseBlack, '#5B6674', 0.25),
    skin: materialKey === 'Metal' ? '#B7BEC8' : mixHex('#D9A981', '#AE8A6F', scarFactor * 0.4),
    cyan: eyeGlow,
    silver: mixHex('#9FB7CC', battleSub, 0.2 + (scarFactor * 0.5)),
    panel: mixHex('#C0C8D2', battleBlue, 0.12 + (scarFactor * 0.4)),
  };
};

export const getSilhouetteScales = (dna: CharacterDNA) => {
  if (dna.silhouette === 'tank') {
    return { body: 1.08, arm: 1.15, legY: 0.94, legXZ: 1.1 };
  }
  if (dna.silhouette === 'striker') {
    return { body: 0.96, arm: 0.93, legY: 1.12, legXZ: 0.9 };
  }
  return { body: 1.0, arm: 1.0, legY: 1.0, legXZ: 1.0 };
};

export const getFinishMaterialTuning = (finish: CharacterFinish) => {
  if (finish === 'matte') return { roughnessBias: 0.12, metalBias: -0.1 };
  if (finish === 'gloss') return { roughnessBias: -0.12, metalBias: 0.1 };
  return { roughnessBias: 0.0, metalBias: 0.0 };
};
