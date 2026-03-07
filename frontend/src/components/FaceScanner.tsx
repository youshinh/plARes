/**
 * FaceScanner.tsx
 *
 * 初回セットアップ画面。インカメラで顔写真を撮影してロボットを生成する。
 * プライバシー配慮のため「スキップ」→テキスト入力 or プリセット選択も可能。
 *
 * 設計参照:
 *   NotebookLM: "顔写真からロボットのパラメータを生成するフロー"
 *   (notebook_id: 46106b3a-80d5-4567-85c4-25dc3ee293cc)
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { getModelTypeCopy, MODEL_TYPE_OPTIONS } from '../constants/modelTypes';
import { useFSMStore } from '../store/useFSMStore';
import type { UiText } from '../types/app';

const buildPresets = (t: UiText) => [
  { label: t.scanPresetSpeedLabel, text: t.scanPresetSpeedPrompt },
  { label: t.scanPresetPowerLabel, text: t.scanPresetPowerPrompt },
  { label: t.scanPresetCharmLabel, text: t.scanPresetCharmPrompt },
];

interface FaceScannerProps {
  t: UiText;
  onGenerate: (faceImageBase64?: string, presetText?: string) => Promise<void>;
  isGenerating: boolean;
}

export const FaceScanner: React.FC<FaceScannerProps> = ({ t, onGenerate, isGenerating }) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);

  const [mode, setMode]           = useState<'camera' | 'skip'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured]   = useState<string | null>(null); // Base64 JPEG
  const [presetText, setPresetText] = useState('');
  const [cameraBootNonce, setCameraBootNonce] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const modelType = useFSMStore(s => s.modelType);
  const setModelType = useFSMStore(s => s.setModelType);
  const presets = buildPresets(t);

  // カメラ起動
  useEffect(() => {
    if (mode !== 'camera') return;
    let active = true;
    setIsCameraReady(false);
    setCameraError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 } })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        if (!active) return;
        setCameraError(t.scanCameraDenied);
        console.warn('[FaceScanner] camera error:', err);
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [mode, t.scanCameraDenied, cameraBootNonce]);

  // スキップ時はカメラ停止
  const handleSkip = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCaptured(null);
    setMode('skip');
  }, []);

  // 撮影
  const handleCapture = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isCameraReady) return;

    canvas.width  = video.videoWidth  || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    setCaptured(dataUrl);
    // カメラ停止
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // 撮り直し
  const handleRetake = useCallback(() => {
    setCaptured(null);
    setCameraError(null);
    setIsCameraReady(false);
    setCameraBootNonce((prev) => prev + 1);
    setMode('camera');
  }, []);

  // ロボット生成を開始
  const handleGenerate = useCallback(async () => {
    if (mode === 'camera' && captured) {
      await onGenerate(captured);
    } else {
      await onGenerate(undefined, presetText || t.scanFallbackPrompt);
    }
  }, [mode, captured, presetText, onGenerate, t.scanFallbackPrompt]);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h2 style={styles.title}>{t.scanTitle}</h2>
        <p style={styles.subtitle}>
          {mode === 'camera'
            ? t.scanCameraDesc
            : t.scanSkipDesc}
        </p>

        {/* ── カメラモード ── */}
        {mode === 'camera' && !cameraError && (
          <>
            {!captured ? (
              <div style={styles.videoWrapper}>
                <video
                  ref={videoRef}
                  style={styles.video}
                  playsInline
                  muted
                  autoPlay
                  onLoadedMetadata={() => setIsCameraReady(true)}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <button
                  id="btn-face-capture"
                  style={styles.captureBtn}
                  onClick={handleCapture}
                  disabled={!isCameraReady}
                >
                  {t.scanCapture}
                </button>
              </div>
            ) : (
              <div style={styles.videoWrapper}>
                <img src={captured} alt="preview" style={styles.video} />
                <button style={{ ...styles.captureBtn, background: '#555' }} onClick={handleRetake}>
                  {t.scanRetake}
                </button>
              </div>
            )}
          </>
        )}

        {/* カメラエラー */}
        {mode === 'camera' && cameraError && (
          <p style={{ color: '#ff8888', margin: '12px 0', fontSize: 13 }}>{cameraError}</p>
        )}

        {/* ── スキップモード ── */}
        {mode === 'skip' && (
          <div style={{ width: '100%' }}>
            <div style={styles.presetGrid}>
              {presets.map((p) => (
                <button
                  key={p.text}
                  style={{
                    ...styles.presetBtn,
                    border: presetText === p.text ? '2px solid #4af' : '2px solid rgba(255,255,255,0.2)',
                  }}
                  onClick={() => setPresetText(p.text)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              style={styles.textarea}
              placeholder={t.scanTextareaPlaceholder}
              value={presetText}
              onChange={(e) => setPresetText(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {/* ── モデル選択（テスト用） ── */}
        <div style={{ display: 'flex', gap: 16, alignSelf: 'center', marginBottom: 10 }}>
          {MODEL_TYPE_OPTIONS.map(({ id }) => {
            const copy = getModelTypeCopy(id, t);
            return (
              <label key={id} style={{ color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={modelType === id} onChange={() => setModelType(id)} /> {copy.title}
              </label>
            );
          })}
        </div>

        {/* ── アクションボタン ── */}
        <div style={styles.actionRow}>
          {mode === 'camera' && (
            <button style={styles.skipBtn} onClick={handleSkip}>
              {t.scanSkip}
            </button>
          )}
          <button
            id="btn-generate-robot"
            style={{
              ...styles.generateBtn,
              opacity: isGenerating ? 0.6 : 1,
              cursor:  isGenerating ? 'not-allowed' : 'pointer',
            }}
            onClick={handleGenerate}
            disabled={isGenerating || (mode === 'camera' && !captured && !cameraError)}
          >
            {isGenerating ? t.scanGenerating : t.scanSummon}
          </button>
        </div>

        {isGenerating && (
          <div style={styles.chargeBar}>
            <div style={styles.chargeBarFill} />
            <span style={{ color: '#0ff', fontSize: 12, marginTop: 6 }}>
              {t.scanAnalyzing}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── スタイル ──────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'linear-gradient(135deg, rgba(10,10,30,0.97) 0%, rgba(20,10,40,0.97) 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '28px 24px',
    maxWidth: 400, width: '92%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    boxShadow: '0 8px 40px rgba(0,180,255,0.15)',
  },
  title: {
    color: '#fff', fontSize: 22, fontWeight: 700, margin: 0,
    fontFamily: "'Inter', sans-serif",
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', margin: 0,
  },
  videoWrapper: {
    position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden',
    background: '#000',
  },
  video: {
    width: '100%', display: 'block', borderRadius: 12,
    aspectRatio: '1 / 1', objectFit: 'cover',
  },
  captureBtn: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    background: '#4488ff', color: '#fff', border: 'none', borderRadius: 24,
    padding: '10px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(68,136,255,0.5)',
  },
  presetGrid: {
    display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12,
  },
  presetBtn: {
    background: 'rgba(255,255,255,0.07)', color: '#eee',
    borderRadius: 10, padding: '10px 14px', fontSize: 14,
    cursor: 'pointer', textAlign: 'left', transition: 'border 0.15s',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.07)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10,
    padding: '10px 12px', fontSize: 13, resize: 'none',
    fontFamily: "'Inter', sans-serif",
  },
  actionRow: {
    display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end',
    marginTop: 4,
  },
  skipBtn: {
    background: 'transparent', color: 'rgba(255,255,255,0.5)',
    border: 'none', fontSize: 13, cursor: 'pointer', padding: '8px 4px',
  },
  generateBtn: {
    background: 'linear-gradient(135deg, #4488ff, #aa44ff)',
    color: '#fff', border: 'none', borderRadius: 12,
    padding: '12px 24px', fontSize: 15, fontWeight: 700,
    boxShadow: '0 4px 20px rgba(100,100,255,0.4)',
    transition: 'opacity 0.2s',
  },
  chargeBar: {
    width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  chargeBarFill: {
    width: '100%', height: 4, borderRadius: 4,
    background: 'linear-gradient(90deg, #0ff, #4af, #aaf)',
    animation: 'chargeAnim 1.5s ease-in-out infinite',
  },
};
