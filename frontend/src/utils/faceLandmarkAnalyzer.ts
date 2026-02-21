export interface FaceLandmarkHints {
  jawWidthRatio: number;
  faceAspectRatio: number;
  eyeOpenness: number;
  mouthOpenness: number;
  browEnergy: number;
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const TASKS_BUNDLE_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const TASKS_WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';

type FaceLandmarkerHandle = {
  detect: (image: HTMLImageElement) => {
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
    faceBlendshapes?: Array<{ categories?: Array<{ categoryName: string; score: number }> }>;
  };
  close?: () => void;
};

let cachedLandmarkerPromise: Promise<FaceLandmarkerHandle | null> | null = null;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });

const getDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt((dx * dx) + (dy * dy));
};

const getBlendshapeScore = (
  categories: Array<{ categoryName: string; score: number }> | undefined,
  name: string,
) => {
  if (!categories) return 0;
  const found = categories.find((c) => c.categoryName === name);
  return found ? clamp01(Number(found.score) || 0) : 0;
};

const computeHintsFromLandmarks = (
  landmarks: Array<{ x: number; y: number }>,
  categories: Array<{ categoryName: string; score: number }> | undefined,
): FaceLandmarkHints => {
  // MediaPipe canonical indices used for coarse geometry.
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const chin = landmarks[152];
  const forehead = landmarks[10];
  const leftEyeTop = landmarks[159];
  const leftEyeBottom = landmarks[145];
  const rightEyeTop = landmarks[386];
  const rightEyeBottom = landmarks[374];
  const leftEyeOuter = landmarks[33];
  const leftEyeInner = landmarks[133];
  const rightEyeOuter = landmarks[263];
  const rightEyeInner = landmarks[362];
  const mouthTop = landmarks[13];
  const mouthBottom = landmarks[14];

  const faceWidth = getDistance(leftCheek, rightCheek);
  const faceHeight = getDistance(forehead, chin);
  const eyeBaseLeft = getDistance(leftEyeOuter, leftEyeInner);
  const eyeBaseRight = getDistance(rightEyeOuter, rightEyeInner);
  const eyeOpenLeft = getDistance(leftEyeTop, leftEyeBottom);
  const eyeOpenRight = getDistance(rightEyeTop, rightEyeBottom);

  const eyeOpenness = clamp01(((eyeOpenLeft / Math.max(0.0001, eyeBaseLeft)) + (eyeOpenRight / Math.max(0.0001, eyeBaseRight))) / 2.4);
  const mouthOpenness = clamp01(getDistance(mouthTop, mouthBottom) / Math.max(0.0001, faceHeight * 0.22));
  const browEnergy = clamp01(
    (getBlendshapeScore(categories, 'browInnerUp') * 0.6) +
    (getBlendshapeScore(categories, 'browOuterUpLeft') * 0.2) +
    (getBlendshapeScore(categories, 'browOuterUpRight') * 0.2),
  );

  return {
    jawWidthRatio: clamp01(faceWidth / Math.max(0.0001, faceHeight * 1.15)),
    faceAspectRatio: clamp01(faceHeight / Math.max(0.0001, faceWidth * 1.35)),
    eyeOpenness,
    mouthOpenness,
    browEnergy,
  };
};

const getLandmarker = async (): Promise<FaceLandmarkerHandle | null> => {
  if (cachedLandmarkerPromise) return cachedLandmarkerPromise;
  cachedLandmarkerPromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ TASKS_BUNDLE_URL);
      const FilesetResolver = mod?.FilesetResolver;
      const FaceLandmarker = mod?.FaceLandmarker;
      if (!FilesetResolver || !FaceLandmarker) return null;

      const vision = await FilesetResolver.forVisionTasks(TASKS_WASM_ROOT);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        runningMode: 'IMAGE',
        numFaces: 1,
      });
      return landmarker as FaceLandmarkerHandle;
    } catch {
      return null;
    }
  })();
  return cachedLandmarkerPromise;
};

export const analyzeFaceLandmarksForDNA = async (
  faceImageBase64?: string,
): Promise<FaceLandmarkHints | null> => {
  if (!faceImageBase64) return null;
  const landmarker = await getLandmarker();
  if (!landmarker) return null;
  try {
    const image = await loadImageFromDataUrl(faceImageBase64);
    const detection = landmarker.detect(image);
    const landmarks = detection.faceLandmarks?.[0];
    if (!landmarks || landmarks.length < 455) return null;
    const categories = detection.faceBlendshapes?.[0]?.categories;
    return computeHintsFromLandmarks(
      landmarks.map((pt) => ({ x: Number(pt.x) || 0, y: Number(pt.y) || 0 })),
      categories?.map((c) => ({ categoryName: c.categoryName, score: Number(c.score) || 0 })),
    );
  } catch {
    return null;
  }
};
