/**
 * useCharacterSetup.ts
 *
 * 初回キャラクター生成フロー管理フック。
 * - localStorage に "plares_robot_initialized" フラグを保持し、初回のみFaceScannerを表示
 * - バックエンドの POST /api/character/generate を呼び出し、レスポンスをFSM storeへ保存
 *
 * 設計参照:
 *   NotebookLM: "顔写真からロボットのパラメータを生成するフロー"
 *   (notebook_id: 46106b3a-80d5-4567-85c4-25dc3ee293cc)
 */

import { useState, useCallback } from 'react';
import { useFSMStore } from '../store/useFSMStore';
import type { RobotGenerationRequest, RobotGenerationResult } from '../../../shared/types/firestore';
import { PLAYER_ID } from '../utils/identity';

const INIT_KEY = 'plares_robot_initialized';

const defaultBackendHost = (() => {
  const h = window.location.hostname || '127.0.0.1';
  return h === 'localhost' || h === '::1' ? '127.0.0.1' : h;
})();
const backendProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
const CHARACTER_API_URL =
  import.meta.env.VITE_CHARACTER_API_URL ??
  `${backendProtocol}://${defaultBackendHost}:8000/api/character/generate`;

export function useCharacterSetup() {
  const setRobotStats = useFSMStore(s => s.setRobotStats);

  // 既に初期化済みかどうか
  const [isSetupDone, setIsSetupDone] = useState<boolean>(() => {
    // E2E / CI環境ではFaceScannerをスキップして即完了扱いにする
    if (import.meta.env.VITE_SKIP_FACE_SCANNER === 'true') return true;
    return localStorage.getItem(INIT_KEY) === 'done';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 顔写真またはテキストでロボットを生成し、storeに反映する。
   * @param faceImageBase64 - インカメラで撮影したBase64 JPEG（undefined = スキップ）
   * @param presetText - スキップ時のテキストプロンプト
   */
  const generateCharacter = useCallback(async (
    faceImageBase64?: string,
    presetText?: string,
  ) => {
    setIsGenerating(true);
    setError(null);

    try {
      const req: RobotGenerationRequest = {
        user_id: PLAYER_ID,
        face_image_base64: faceImageBase64,
        preset_text: presetText,
      };

      const res = await fetch(CHARACTER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: RobotGenerationResult = await res.json();

      setRobotStats(
        {
          power: data.stats.power,
          speed: data.stats.speed,
          vit:   data.stats.vit,
        },
        {
          name:     data.name,
          material: data.material,
          tone:     data.personality.tone,
        },
      );

      localStorage.setItem(INIT_KEY, 'done');
      setIsSetupDone(true);
    } catch (err) {
      console.error('[useCharacterSetup] generation failed:', err);
      setError(String(err));
      // エラーでもデフォルト値のままゲームを開始できるようセットアップ完了扱いにする
      localStorage.setItem(INIT_KEY, 'done');
      setIsSetupDone(true);
    } finally {
      setIsGenerating(false);
    }
  }, [setRobotStats]);

  /** デバッグ用：初期化フラグをリセットして再度FaceScannerを表示させる */
  const resetSetup = useCallback(() => {
    localStorage.removeItem(INIT_KEY);
    setIsSetupDone(false);
  }, []);

  return { isSetupDone, isGenerating, error, generateCharacter, resetSetup };
}
