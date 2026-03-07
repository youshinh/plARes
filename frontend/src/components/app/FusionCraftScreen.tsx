import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FusionCraftFlowState, UiText } from '../../types/app';
import type { MountPointId } from '../robot/constants';
import { ScanEquipmentFlow } from '../ui/ScanEquipmentFlow';

type FusionCraftScreenProps = {
  t: UiText;
  flow: FusionCraftFlowState;
  onBack: () => void;
  onSubmitFusionCraft: (payload: {
    requestId: string;
    concept: string;
    referenceImage: string;
    craftKind: 'skin' | 'attachment';
    mountPoint: MountPointId;
  }) => void;
};

const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.82;
const SUBMIT_TIMEOUT_MS = 15000;

const createFusionRequestId = () => `fusion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });

const compressDataUrl = async (dataUrl: string): Promise<string> => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const ratio = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

export const FusionCraftScreen: React.FC<FusionCraftScreenProps> = ({
  t,
  flow,
  onBack,
  onSubmitFusionCraft,
}) => {
  const [concept, setConcept] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [localRequestId, setLocalRequestId] = useState('');
  const [localStatus, setLocalStatus] = useState<FusionCraftFlowState['status']>('idle');
  const [errorText, setErrorText] = useState('');
  const [craftKind, setCraftKind] = useState<FusionCraftFlowState['craftKind']>(flow.craftKind || 'skin');
  const [mountPoint, setMountPoint] = useState<FusionCraftFlowState['mountPoint']>(flow.mountPoint || 'WEAPON_R');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const submitTimerRef = useRef<number | null>(null);

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
  }, []);

  const canSubmit = Boolean(image && concept.trim()) && localStatus !== 'submitting';
  const statusText = useMemo(() => {
    if (localStatus === 'submitting') return t.fusionWaiting;
    if (localStatus === 'success') return flow.message || t.fusionSuccessBody;
    if (localStatus === 'error') return errorText || t.fusionError;
    return t.fusionHint;
  }, [errorText, flow.message, localStatus, t.fusionError, t.fusionHint, t.fusionSuccessBody, t.fusionWaiting]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorText('');
    setLocalStatus('captured');
    const raw = await readFileAsDataUrl(file);
    const compressed = await compressDataUrl(raw);
    setImage(compressed);
  };

  const handleCraft = () => {
    if (!image || !concept.trim()) {
      setErrorText(t.fusionValidation);
      setLocalStatus('error');
      return;
    }

    const requestId = createFusionRequestId();
    setErrorText('');
    setLocalRequestId(requestId);
    setLocalStatus('submitting');
    onSubmitFusionCraft({
      requestId,
      concept: concept.trim(),
      referenceImage: image.split(',')[1] ?? image,
      craftKind,
      mountPoint,
    });

    submitTimerRef.current = window.setTimeout(() => {
      setLocalStatus('error');
      setErrorText(t.fusionError);
    }, SUBMIT_TIMEOUT_MS);
  };

  const handleRetake = () => {
    setImage(null);
    setLocalStatus('idle');
    setErrorText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openPicker = (input: HTMLInputElement | null) => {
    if (!input || localStatus === 'submitting') return;
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }
    input.click();
  };

  const disableBack = localStatus === 'submitting';

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
            onChangeCraftKind={setCraftKind}
            onChangeMountPoint={setMountPoint}
          />
          <div
            className={`image-capture-zone ${localStatus === 'submitting' ? 'is-disabled' : ''}`}
            role="button"
            tabIndex={localStatus === 'submitting' ? -1 : 0}
            onClick={() => openPicker(cameraInputRef.current)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker(cameraInputRef.current);
              }
            }}
          >
            {image ? (
              <img src={image} alt="Captured" className="captured-preview" />
            ) : (
              <div className="capture-placeholder">
                <span className="icon">📷</span>
                <span>{t.fusionCapturePrompt}</span>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={localStatus === 'submitting'}
          />
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={localStatus === 'submitting'}
          />
          <button
            type="button"
            className="hud-btn hud-btn-carbon fusion-picker-btn"
            onClick={() => openPicker(fileInputRef.current)}
            disabled={localStatus === 'submitting'}
          >
            {t.fusionCapturePrompt}
          </button>

          <div className="input-group">
            <label>{craftKind === 'attachment' ? t.scanEquipmentPromptLabel : t.fusionConceptLabel}</label>
            <input
              type="text"
              placeholder={craftKind === 'attachment' ? t.scanEquipmentPromptPlaceholder : t.fusionConceptPlaceholder}
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              disabled={localStatus === 'submitting'}
            />
          </div>

          {errorText && localStatus === 'error' && (
            <div className="fusion-flow-error">{errorText}</div>
          )}
          {flow.textureUrl && localStatus === 'success' && (
            <div className="fusion-flow-success-url">{flow.textureUrl}</div>
          )}

          <div className="fusion-flow-actions">
            <button className="hud-btn hud-btn-carbon" onClick={handleRetake} disabled={localStatus === 'submitting'}>
              {t.fusionRetake}
            </button>
            <button className="hud-btn hud-btn-blue" onClick={handleCraft} disabled={!canSubmit}>
              {localStatus === 'submitting' ? t.fusionGenerating : t.fusionBegin}
            </button>
            <button className="hud-btn hud-btn-teal" onClick={onBack} disabled={disableBack}>
              {t.fusionClose}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
