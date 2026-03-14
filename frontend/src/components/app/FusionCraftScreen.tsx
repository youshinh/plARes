import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FusionCraftFlowState, UiText } from '../../types/app';
import type { MountPointId } from '../robot/constants';
import { ScanEquipmentFlow } from '../ui/ScanEquipmentFlow';

type FusionCraftScreenProps = {
  t: UiText;
  flow: FusionCraftFlowState;
  isARSessionActive: boolean;
  onBack: () => void;
  onSubmitFusionCraft: (payload: {
    requestId: string;
    concept: string;
    referenceImage: string;
    craftKind: 'skin' | 'attachment';
    mountPoint: MountPointId;
  }) => void;
};

const SUBMIT_TIMEOUT_MS = 15000;

// ── Image helpers ──────────────────────────────────────────────────────────
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.78;

const createFusionRequestId = () => `fusion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Load an image element from a blob/object URL.
 */
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });

/**
 * Compress & resize a File to a base64 JPEG data URL (max 1024px edge).
 * Runs entirely off the main thread where possible.
 */
const compressImageFile = async (file: File): Promise<string> => {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(blobUrl);
    const ratio = Math.min(1, MAX_EDGE / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round((img.width || 1) * ratio));
    const h = Math.max(1, Math.round((img.height || 1) * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_context_failed');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
};

export const FusionCraftScreen: React.FC<FusionCraftScreenProps> = ({
  t,
  flow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isARSessionActive: _isARSessionActive,
  onBack,
  onSubmitFusionCraft,
}) => {
  const [concept, setConcept] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [localRequestId, setLocalRequestId] = useState('');
  const [localStatus, setLocalStatus] = useState<FusionCraftFlowState['status']>('idle');
  const [errorText, setErrorText] = useState('');
  const [craftKind, setCraftKind] = useState<FusionCraftFlowState['craftKind']>(flow.craftKind || 'skin');
  const [mountPoint, setMountPoint] = useState<FusionCraftFlowState['mountPoint']>(flow.mountPoint || 'WEAPON_R');
  const submitTimerRef = useRef<number | null>(null);

  // Unique IDs so <label htmlFor> can reference the correct input.
  const cameraInputId = useRef(`fusion-cam-${Math.random().toString(36).slice(2, 8)}`).current;
  const fileInputId = useRef(`fusion-file-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    setLocalStatus('idle');
    setErrorText('');
    setLocalRequestId('');
    setCraftKind(flow.craftKind || 'skin');
    setMountPoint(flow.mountPoint || 'WEAPON_R');
  }, []);

  useEffect(() => {
    if (!localRequestId || flow.requestId !== localRequestId) return;

    if (submitTimerRef.current) {
      window.clearTimeout(submitTimerRef.current);
      submitTimerRef.current = null;
    }

    setLocalStatus(flow.status);
    if (flow.status === 'error') {
      setErrorText(flow.message || t.fusionError);
    }
  }, [flow, localRequestId, t.fusionError]);

  useEffect(() => () => {
    if (submitTimerRef.current) {
      window.clearTimeout(submitTimerRef.current);
    }
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
  }, [imagePreviewUrl]);

  const canSubmit = Boolean(imageFile && concept.trim()) && localStatus !== 'submitting';
  const statusText = useMemo(() => {
    if (localStatus === 'submitting') return t.fusionWaiting;
    if (localStatus === 'success') return flow.message || t.fusionSuccessBody;
    if (localStatus === 'error') return errorText || t.fusionError;
    return t.fusionHint;
  }, [errorText, flow.message, localStatus, t.fusionError, t.fusionHint, t.fusionSuccessBody, t.fusionWaiting]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setErrorText('');
      setImageFile(file);
      setImagePreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      setLocalStatus('captured');
    } catch (error) {
      console.error('[FusionCraft] Capture handling failed', error);
      setLocalStatus('error');
      setErrorText(t.fusionError);
    }
  };

  const handleCraft = async () => {
    if (!imageFile || !concept.trim()) {
      setErrorText(t.fusionValidation);
      setLocalStatus('error');
      return;
    }

    const requestId = createFusionRequestId();
    setErrorText('');
    setLocalRequestId(requestId);
    setLocalStatus('submitting');

    try {
      // Yield to let the UI update before heavy work.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      // Compress + resize to prevent main-thread freeze from huge base64 payloads.
      const compressed = await compressImageFile(imageFile);
      const base64Body = compressed.split(',')[1] ?? compressed;

      onSubmitFusionCraft({
        requestId,
        concept: concept.trim(),
        referenceImage: base64Body,
        craftKind,
        mountPoint,
      });
    } catch (error) {
      console.error('[FusionCraft] Failed to prepare image payload', error);
      setLocalStatus('error');
      setErrorText(t.fusionError);
      return;
    }

    submitTimerRef.current = window.setTimeout(() => {
      setLocalStatus('error');
      setErrorText(t.fusionError);
    }, SUBMIT_TIMEOUT_MS);
  };

  const handleRetake = () => {
    if (imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImageFile(null);
    setImagePreviewUrl(null);
    setLocalStatus('idle');
    setErrorText('');
  };

  const handleCraftKindChange = (next: 'skin' | 'attachment') => {
    setCraftKind(next);
    handleRetake();
    setLocalRequestId('');
  };

  const isSubmitting = localStatus === 'submitting';
  const cameraButtonLabel = t.fusionCaptureNow || '写真を撮る';
  const uploadButtonLabel = t.fusionUploadFromLibrary || '画像を選ぶ';

  return (
    <section className="play-mode-screen hud-animate is-walk is-fusion-craft" aria-label={t.fusionTitle}>
      <div className="play-mode-panel fusion-play-panel">
        <div className="play-mode-eyebrow">{t.fusionLaunch}</div>
        <h2>{t.fusionTitle}</h2>
        <p>{statusText}</p>
        <div className="fusion-flow-body">
          <ScanEquipmentFlow
            t={t}
            craftKind={craftKind}
            mountPoint={mountPoint}
            onChangeCraftKind={handleCraftKindChange}
            onChangeMountPoint={setMountPoint}
          />
          <div
            className={`image-capture-zone ${isSubmitting ? 'is-disabled' : ''}`}
          >
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="Captured" className="captured-preview" />
            ) : (
              <div className="capture-placeholder">
                <span className="icon">📷</span>
                <span>{t.fusionCapturePrompt}</span>
              </div>
            )}
          </div>

          {/*
           * Use visible <label> elements wrapping hidden <input>s.
           * Unlike programmatic .click(), <label> triggers a real user-gesture
           * even inside XR DOM Overlay on mobile browsers.
           */}
          <input
            id={cameraInputId}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={isSubmitting}
          />
          <input
            id={fileInputId}
            type="file"
            accept="image/*,.heic,.heif"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={isSubmitting}
          />
          <div className="fusion-picker-grid">
            <label
              htmlFor={isSubmitting ? undefined : cameraInputId}
              className={`hud-btn hud-btn-carbon fusion-picker-btn${isSubmitting ? ' is-disabled' : ''}`}
              role="button"
              aria-disabled={isSubmitting}
            >
              {cameraButtonLabel}
            </label>
            <label
              htmlFor={isSubmitting ? undefined : fileInputId}
              className={`hud-btn hud-btn-blue fusion-picker-btn${isSubmitting ? ' is-disabled' : ''}`}
              role="button"
              aria-disabled={isSubmitting}
            >
              {uploadButtonLabel}
            </label>
          </div>

          <div className="input-group">
            <label>{craftKind === 'attachment' ? t.scanEquipmentPromptLabel : t.fusionConceptLabel}</label>
            <input
              type="text"
              placeholder={craftKind === 'attachment' ? t.scanEquipmentPromptPlaceholder : t.fusionConceptPlaceholder}
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {errorText && localStatus === 'error' && (
            <div className="fusion-flow-error">{errorText}</div>
          )}
          {flow.textureUrl && localStatus === 'success' && (
            <div className="fusion-flow-success-url">{flow.textureUrl}</div>
          )}

          <div className="fusion-flow-actions">
            <button className="hud-btn hud-btn-carbon" onClick={handleRetake} disabled={isSubmitting}>
              {t.fusionRetake}
            </button>
            <button className="hud-btn hud-btn-blue" onClick={handleCraft} disabled={!canSubmit}>
              {isSubmitting ? t.fusionGenerating : t.fusionBegin}
            </button>
            <button className="hud-btn hud-btn-teal" onClick={onBack}>
              {t.fusionClose}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
