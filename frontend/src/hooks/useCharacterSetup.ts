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
import { analyzePhotoForDNA } from '../utils/photoDNAAnalyzer';
import { analyzeFaceLandmarksForDNA } from '../utils/faceLandmarkAnalyzer';
import {
  buildCharacterDNA,
  evolveCharacterDNAByMatchCount,
  normalizeCharacterDNA,
  refineCharacterDNAWithPhotoHints,
} from '../utils/characterDNA';

const INIT_KEY = 'plares_robot_initialized';

const defaultBackendHost = (() => {
  const h = window.location.hostname || '127.0.0.1';
  return h === 'localhost' || h === '::1' ? '127.0.0.1' : h;
})();
const backendProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
const CHARACTER_WS_URL =
  import.meta.env.VITE_CHARACTER_WS_URL ??
  `${backendProtocol === 'https' ? 'wss' : 'ws'}://${defaultBackendHost}:8000/ws/character`;

export function useCharacterSetup() {
  const setRobotStats = useFSMStore(s => s.setRobotStats);
  const setRobotDna = useFSMStore(s => s.setRobotDna);

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
      const photoHintsPromise = analyzePhotoForDNA(faceImageBase64);
      const landmarkHintsPromise = analyzeFaceLandmarksForDNA(faceImageBase64);
      const req: RobotGenerationRequest = {
        user_id: PLAYER_ID,
        face_image_base64: faceImageBase64,
        preset_text: presetText,
      };

      const data: RobotGenerationResult = await new Promise((resolve, reject) => {
        const ws = new WebSocket(CHARACTER_WS_URL);
        
        ws.onopen = () => {
          ws.send(JSON.stringify(req));
        };
        
        ws.onmessage = (event) => {
          try {
            const result = JSON.parse(event.data);
            if (result.error) reject(new Error(result.error));
            else {
              // T2-3: If the result is a fallback, warn the user but still resolve
              if (result.is_fallback || result.error_code) {
                const code = result.error_code || 'unknown';
                console.warn(`[useCharacterSetup] Fallback result used (error_code: ${code})`);
                window.dispatchEvent(new CustomEvent('show_subtitle', {
                  detail: { text: `AI生成が一時的に利用不可のためデフォルト値を使用しました (${code})` }
                }));
              }
              resolve(result);
            }
          } catch (e) {
            reject(new Error('Failed to parse generation result'));
          } finally {
            ws.close();
          }
        };
        
        ws.onerror = () => {
          reject(new Error('WebSocket connection failed during character generation'));
        };
      });
      const photoHints = await photoHintsPromise;
      const landmarkHints = await landmarkHintsPromise;

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

      const maybeSnakeCaseDna =
        (data as RobotGenerationResult & { character_dna?: unknown }).character_dna;
      const apiDna =
        normalizeCharacterDNA(data.characterDna) ??
        normalizeCharacterDNA(maybeSnakeCaseDna);
      const dna = apiDna
        ? evolveCharacterDNAByMatchCount(
            refineCharacterDNAWithPhotoHints(apiDna, photoHints, data.personality.tone, landmarkHints),
            0,
          )
        :
          buildCharacterDNA({
            playerId: PLAYER_ID,
            name: data.name,
            material: data.material,
            tone: data.personality.tone,
            power: data.stats.power,
            speed: data.stats.speed,
            vit: data.stats.vit,
            faceImageBase64,
            presetText,
            photoHints,
            landmarkHints,
          });
      setRobotDna(dna);

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
  }, [setRobotStats, setRobotDna]);

  /** デバッグ用：初期化フラグをリセットして再度FaceScannerを表示させる */
  const resetSetup = useCallback(() => {
    localStorage.removeItem(INIT_KEY);
    setIsSetupDone(false);
  }, []);

  return { isSetupDone, isGenerating, error, generateCharacter, resetSetup };
}
