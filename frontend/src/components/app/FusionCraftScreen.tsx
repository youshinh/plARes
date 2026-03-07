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

const createFusionRequestId = () => `fusion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });

export const FusionCraftScreen: React.FC<FusionCraftScreenProps> = ({
  t,
  flow,
  isARSessionActive,
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
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      const raw = await readFileAsDataUrl(imageFile);
      onSubmitFusionCraft({
        requestId,
        concept: concept.trim(),
        referenceImage: raw.split(',')[1] ?? raw,
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
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const openPicker = (input: HTMLInputElement | null) => {
    if (!input || localStatus === 'submitting') return;
    input.value = '';
    input.click();
  };

  const cameraLockedMessage =
    t.fusionArCameraLocked ||
    'AR使用中はカメラ撮影を停止しています。画像選択を使ってください。';
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
            onChangeCraftKind={setCraftKind}
            onChangeMountPoint={setMountPoint}
          />
          <div
            className={`image-capture-zone ${localStatus === 'submitting' ? 'is-disabled' : ''}`}
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
          <input
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            ref={cameraInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={localStatus === 'submitting' || isARSessionActive}
          />
          <input
            type="file"
            accept="image/*,.heic,.heif"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={localStatus === 'submitting'}
          />
          <div className="fusion-picker-grid">
            <button
              type="button"
              className="hud-btn hud-btn-carbon fusion-picker-btn"
              onClick={() => openPicker(cameraInputRef.current)}
              disabled={localStatus === 'submitting' || isARSessionActive}
            >
              {cameraButtonLabel}
            </button>
            <button
              type="button"
              className="hud-btn hud-btn-blue fusion-picker-btn"
              onClick={() => openPicker(fileInputRef.current)}
              disabled={localStatus === 'submitting'}
            >
              {uploadButtonLabel}
            </button>
          </div>
          {isARSessionActive && (
            <div className="play-mode-banner fusion-picker-lock">{cameraLockedMessage}</div>
          )}

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
            <button className="hud-btn hud-btn-teal" onClick={onBack}>
              {t.fusionClose}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
