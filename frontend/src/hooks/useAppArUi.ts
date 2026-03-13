import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type * as THREE from 'three';
import { showSubtitle } from '../utils/uiEvents';
import type { ArSupportState, ScanState } from '../types/app';

type XrStoreController = {
  enterAR: () => Promise<unknown>;
};

type UseAppArUiArgs = {
  preferJapanese: boolean;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  shadowsEnabled: boolean;
  unsupportedHintText: string;
  xrStore: XrStoreController;
};

const formatArEnterError = (error: unknown, preferJapanese: boolean): string => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return preferJapanese
        ? 'AR開始にはカメラ権限が必要です。Chromeのサイト権限を確認してください。'
        : 'Camera permission is required to start AR. Please check Chrome site permissions.';
    }
    if (error.name === 'NotSupportedError') {
      return preferJapanese
        ? 'この端末またはブラウザではWebXR ARが利用できません。'
        : 'WebXR AR is not supported on this device or browser.';
    }
    if (error.name === 'SecurityError') {
      return preferJapanese
        ? 'AR開始にはHTTPS接続が必要です。'
        : 'HTTPS is required to start AR.';
    }
  }

  return preferJapanese
    ? 'ARセッションの開始に失敗しました。ページ再読み込み後に再実行してください。'
    : 'Failed to start AR session. Reload the page and try again.';
};

export const useAppArUi = ({
  preferJapanese,
  rendererRef,
  shadowsEnabled,
  unsupportedHintText,
  xrStore,
}: UseAppArUiArgs) => {
  const [arSupportState, setArSupportState] = useState<ArSupportState>('checking');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanPointCount, setScanPointCount] = useState(0);
  const [isARSessionActive, setIsARSessionActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr || typeof xr.isSessionSupported !== 'function') {
      setArSupportState('unsupported');
      return;
    }

    xr.isSessionSupported('immersive-ar')
      .then((supported) => {
        if (!cancelled) {
          setArSupportState(supported ? 'supported' : 'unsupported');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArSupportState('unsupported');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        scanState?: ScanState;
        pointCount?: number;
        sessionActive?: boolean;
      }>).detail;
      if (!detail) return;

      setScanState(detail.scanState ?? 'idle');
      setScanPointCount(Number(detail.pointCount ?? 0));
      setIsARSessionActive(Boolean(detail.sessionActive));
    };

    window.addEventListener('scan_state_change', handler);
    return () => window.removeEventListener('scan_state_change', handler);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const presenting = Boolean(rendererRef.current?.xr?.isPresenting);
      setIsARSessionActive((prev) => (prev === presenting ? prev : presenting));
    }, 250);
    return () => window.clearInterval(timer);
  }, [rendererRef]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const enableShadows = shadowsEnabled && !isARSessionActive;
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.autoUpdate = enableShadows;
  }, [isARSessionActive, rendererRef, shadowsEnabled]);

  const handleEnterAr = useCallback(async () => {
    if (arSupportState !== 'supported') {
      showSubtitle(unsupportedHintText);
      return false;
    }

    try {
      await xrStore.enterAR();
      setIsARSessionActive(true);
      return true;
    } catch (error) {
      console.error('[XR] enterAR failed:', error);
      showSubtitle(formatArEnterError(error, preferJapanese));
      return false;
    }
  }, [arSupportState, preferJapanese, unsupportedHintText, xrStore]);

  return {
    arSupportState,
    handleEnterAr,
    isARSessionActive,
    scanPointCount,
    scanState,
  };
};
