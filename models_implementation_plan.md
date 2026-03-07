# Character System Enhancement — Implementation Plan

## Overview

plARes ARのキャラクターシステムを大幅に拡張する。材質(3種)×体型(2種)の6バリエーション、ステータス連動ボーンスケール、4点マウントポイント装備システム、顔写真ラッピング、動的スキャン装備生成の5機能を段階的に実装する。

---

## Phase 1: 6キャラクターバリエーション

> ModelTypeId を `'A'|'B'` → 6種に拡張し、材質×体型のステータス・外観差異を実装する。

---

### Shared Types

#### [MODIFY] [firestore.d.ts](file:///Users/you/code/plaresAR/shared/types/firestore.d.ts)

[CharacterDNA](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts#9-24) インターフェースに体型フィールドを追加：

```diff
 export interface CharacterDNA {
   version: "v1";
   seed: number;
   silhouette: "striker" | "tank" | "ace";
+  bodyType: "heavy" | "slim";
   finish: "matte" | "satin" | "gloss";
   // ...
 }
```

[RobotGenerationRequest](file:///Users/you/code/plaresAR/shared/types/firestore.d.ts#51-60) のモデルタイプを拡張：

```diff
-  model_type?: "A" | "B";
+  model_type?: "wood_heavy" | "wood_slim" | "resin_heavy" | "resin_slim" | "metal_heavy" | "metal_slim";
```

---

### Frontend Constants

#### [MODIFY] [modelTypes.ts](file:///Users/you/code/plaresAR/frontend/src/constants/modelTypes.ts)

`MODEL_TYPE_OPTIONS` を6種に拡張し、材質・体型メタデータを追加：

```typescript
export const MODEL_TYPE_OPTIONS = [
  { id: 'wood_heavy',   material: 'Wood',  bodyType: 'heavy', label: '木材・ヘビー' },
  { id: 'wood_slim',    material: 'Wood',  bodyType: 'slim',  label: '木材・スリム' },
  { id: 'resin_heavy',  material: 'Resin', bodyType: 'heavy', label: '樹脂・ヘビー' },
  { id: 'resin_slim',   material: 'Resin', bodyType: 'slim',  label: '樹脂・スリム' },
  { id: 'metal_heavy',  material: 'Metal', bodyType: 'heavy', label: '金属・ヘビー' },
  { id: 'metal_slim',   material: 'Metal', bodyType: 'slim',  label: '金属・スリム' },
] as const;

export type ModelTypeId = (typeof MODEL_TYPE_OPTIONS)[number]['id'];

// 材質×体型の初期ステータスプリセット
export const BASE_STAT_PRESETS: Record<ModelTypeId, { hp: number; speed: number; power: number }> = {
  wood_heavy:  { hp: 80, speed: 30, power: 65 },
  wood_slim:   { hp: 55, speed: 55, power: 50 },
  resin_heavy: { hp: 60, speed: 35, power: 85 },
  resin_slim:  { hp: 35, speed: 95, power: 35 },
  metal_heavy: { hp: 99, speed: 20, power: 80 },
  metal_slim:  { hp: 40, speed: 80, power: 75 },
};
```

#### Model directory mapping:
`/models/A/` → `/models/wood_heavy/` 等にリネーム or fallback map追加

```typescript
// 後方互換: 旧A/Bモデルを新IDにマッピング
export const MODEL_GLB_PATH: Record<ModelTypeId, string> = {
  wood_heavy:  '/models/A/Character_output.glb',  // Phase2中に差替え
  wood_slim:   '/models/A/Character_output.glb',
  resin_heavy: '/models/B/Character_output.glb',
  resin_slim:  '/models/B/Character_output.glb',
  metal_heavy: '/models/A/Character_output.glb',
  metal_slim:  '/models/B/Character_output.glb',
};
```

> [!NOTE]
> 6体の専用GLBモデルが完成するまでは、既存A/Bモデルをフォールバックとして使用。差し替えは `MODEL_GLB_PATH` の値を変更するだけで完了する。

---

### Character DNA

#### [MODIFY] [characterDNA.ts](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts)

1. [CharacterSilhouette](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts#5-6) に `'heavy' | 'slim'` を新たに `bodyType` として追加（既存の `silhouette` と共存）
2. [CharacterDNA](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts#9-24) に `bodyType` フィールド追加
3. [getSilhouetteScales()](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts#409-418) を `bodyType` も考慮するよう拡張

```typescript
export type CharacterBodyType = 'heavy' | 'slim';

// characterDNA インターフェースに追加
export interface CharacterDNA {
  // ...existing fields...
  bodyType: CharacterBodyType;
}

// 体型 + シルエットの複合スケール
export const getBodyTypeScales = (bodyType: CharacterBodyType, silhouette: CharacterSilhouette) => {
  const base = bodyType === 'heavy'
    ? { body: 1.12, armXZ: 1.20, legXZ: 1.15, legY: 0.92, torsoXZ: 1.18 }
    : { body: 0.94, armXZ: 0.88, legXZ: 0.90, legY: 1.10, torsoXZ: 0.92 };

  // silhouette による微調整
  if (silhouette === 'tank') {
    base.armXZ *= 1.08; base.torsoXZ *= 1.05;
  } else if (silhouette === 'striker') {
    base.legY *= 1.06; base.armXZ *= 0.95;
  }
  return base;
};
```

4. [buildCharacterDNA()](file:///Users/you/code/plaresAR/frontend/src/utils/characterDNA.ts#234-307) で材質→体型の自動判定を追加
5. 材質別PBRチューニング定数を追加：

```typescript
export const MATERIAL_PBR_TUNING: Record<RobotMaterial, {
  roughnessBase: number; metalnessBase: number; clearcoat: number;
  envMapIntensity: number;
}> = {
  Wood:  { roughnessBase: 0.55, metalnessBase: 0.10, clearcoat: 0.15, envMapIntensity: 0.3 },
  Resin: { roughnessBase: 0.30, metalnessBase: 0.25, clearcoat: 0.60, envMapIntensity: 0.6 },
  Metal: { roughnessBase: 0.18, metalnessBase: 0.85, clearcoat: 0.80, envMapIntensity: 1.0 },
};
```

---

### Model Loading

#### [MODIFY] [useRobotAssetBundle.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/useRobotAssetBundle.ts)

```diff
-  const heroModelUrl = `/models/${modelType}/Character_output.glb`;
-  const fallbackModelUrl = `/models/${modelType === 'A' ? 'B' : 'A'}/Character_output.glb`;
+  const heroModelUrl = MODEL_GLB_PATH[modelType];
+  const fallbackModelUrl = MODEL_GLB_PATH[modelType === 'wood_heavy' ? 'resin_heavy' : 'wood_heavy'];
```

---

### Appearance

#### [MODIFY] [useRobotAppearance.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/useRobotAppearance.ts)

材質別PBRチューニングを [buildHeroMat()](file:///Users/you/code/plaresAR/frontend/src/components/robot/useRobotAppearance.ts#152-163) に適用：

```typescript
// MATERIAL_PBR_TUNING を import して適用
const matTuning = MATERIAL_PBR_TUNING[normalizeMaterial(robotMaterial)];
// roughness/metalness の基準値を matTuning から取得
```

---

### State Management

#### [MODIFY] [useFSMStore.ts](file:///Users/you/code/plaresAR/frontend/src/store/useFSMStore.ts)

[loadInitialModelType()](file:///Users/you/code/plaresAR/frontend/src/store/useFSMStore.ts#9-17) のフォールバック値とバリデーションを6種対応に変更。

---

### UI

#### [MODIFY] [BattlePrepOverlay.tsx](file:///Users/you/code/plaresAR/frontend/src/components/app/BattlePrepOverlay.tsx)

6種モデル選択グリッドに更新：
- `is-duo` → `is-hex` グリッド（2×3 or 3×2レイアウト）
- 各ボタンに材質アイコン ＋ 体型シルエット表示
- 材質ごとの三すくみ関係のツールチップ表示

---

### Backend

#### [MODIFY] [character_generator.py](file:///Users/you/code/plaresAR/backend/ai_core/character_generator.py)

- `material` 選択結果 + 顔写真分析結果から `bodyType` を自動判定するロジック追加
- [_normalize_result()](file:///Users/you/code/plaresAR/backend/ai_core/character_generator.py#200-262) の出力に `bodyType` フィールド追加

---

### Remote Character

#### [MODIFY] [RemoteRobotCharacter.tsx](file:///Users/you/code/plaresAR/frontend/src/components/RemoteRobotCharacter.tsx)

`enemyModelType` が6種のいずれかを受け取れるようにモデルロード部分を更新。

---

## Phase 2: ボーンスケーリング（ステータス連動）

> power/speed/vit の値に応じて腕・脚・胴体のボーンをリアルタイムスケーリングする。

---

### New Hook

#### [NEW] [useRobotBoneScaling.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/useRobotBoneScaling.ts)

`heroScene` 内のスケルトンを取得し、ステータスに応じてボーンスケールを適用する新しいフック：

```typescript
import { useEffect } from 'react';
import * as THREE from 'three';
import type { CharacterDNA } from '../../../../shared/types/firestore';
import type { RobotStats } from '../../store/useFSMStore';
import { getBodyTypeScales } from '../../utils/characterDNA';

// ボーン名とステータスのマッピング
const BONE_STAT_MAP = {
  power: {  // パワー → 腕の太さ
    bones: ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'],
    axis: 'xz', // XZ方向に太く
    range: [0.85, 1.25], // stat=1 → 0.85倍, stat=99 → 1.25倍
  },
  speed: {  // スピード → 脚の伸長
    bones: ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'],
    axis: 'y', // Y方向に伸びる
    range: [0.92, 1.15],
  },
  vit: {    // VIT → 胴体・肩幅
    bones: ['Spine', 'Spine01', 'Spine02', 'LeftShoulder', 'RightShoulder'],
    axis: 'xz',
    range: [0.90, 1.18],
  },
} as const;

export const useRobotBoneScaling = (
  heroScene: THREE.Group | null,
  stats: RobotStats,
  dna: CharacterDNA,
) => {
  useEffect(() => {
    if (!heroScene) return;

    // スケルトン取得
    let skeleton: THREE.Skeleton | null = null;
    heroScene.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh && mesh.skeleton) {
        skeleton = mesh.skeleton;
      }
    });
    if (!skeleton) return;

    // 体型ベーススケール適用
    const bodyScales = getBodyTypeScales(dna.bodyType, dna.silhouette);

    // ステータス連動スケール適用
    for (const [statKey, config] of Object.entries(BONE_STAT_MAP)) {
      const statValue = stats[statKey as keyof RobotStats];
      const t = Math.max(0, Math.min(1, (statValue - 1) / 98));
      const scale = config.range[0] + t * (config.range[1] - config.range[0]);

      for (const boneName of config.bones) {
        const bone = skeleton.getBoneByName(boneName);
        if (!bone) continue;

        if (config.axis === 'xz') {
          bone.scale.set(scale, 1, scale);
        } else {
          bone.scale.set(1, scale, 1);
        }
      }
    }
  }, [heroScene, stats, dna]);
};
```

---

#### [MODIFY] [RobotCharacter.tsx](file:///Users/you/code/plaresAR/frontend/src/components/RobotCharacter.tsx)

新しいフックを呼び出し追加：

```diff
+import { useRobotBoneScaling } from './robot/useRobotBoneScaling';

 // useRobotAppearance の後に追加
+useRobotBoneScaling(heroScene, robotStats, robotDna);
```

#### [MODIFY] [RemoteRobotCharacter.tsx](file:///Users/you/code/plaresAR/frontend/src/components/RemoteRobotCharacter.tsx)

同様にリモートキャラクターにもボーンスケーリングを適用。

---

## Phase 3: マウントポイント装備システム

> 4つの標準マウントポイントを定義し、装備GLBの動的着脱を実装する。

---

### Constants

#### [MODIFY] [constants.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/constants.ts)

```typescript
// 標準マウントポイント定義
export const MOUNT_POINTS = {
  WEAPON_R: 'Node_Weapon_R',        // 右手首
  WEAPON_L: 'Node_Weapon_L',        // 左手首
  HEAD_ACCESSORY: 'Node_Head_Accessory', // 頭部
  BACKPACK: 'Node_Backpack',        // 背面
} as const;

export type MountPointId = keyof typeof MOUNT_POINTS;

// 各マウントポイントの親ボーン（GLBにノードがない場合のフォールバック）
export const MOUNT_PARENT_BONES: Record<MountPointId, string> = {
  WEAPON_R: 'RightHand',
  WEAPON_L: 'LeftHand',
  HEAD_ACCESSORY: 'Head',
  BACKPACK: 'Spine01',
};
```

---

### Mount Point Injection

#### [NEW] [mountPointInjector.ts](file:///Users/you/code/plaresAR/frontend/src/utils/mountPointInjector.ts)

GLBロード後にマウントポイントを自動注入するユーティリティ：

```typescript
import * as THREE from 'three';
import { MOUNT_POINTS, MOUNT_PARENT_BONES, type MountPointId } from '../components/robot/constants';

/**
 * heroScene にマウントポイントノードを注入する。
 * GLBに既存ノードがあればそれを使い、なければ親ボーンの子として空のGroupを追加。
 */
export const injectMountPoints = (
  heroScene: THREE.Group,
): Record<MountPointId, THREE.Object3D | null> => {
  const result: Record<string, THREE.Object3D | null> = {};

  for (const [mountId, nodeName] of Object.entries(MOUNT_POINTS)) {
    // 既存ノードを探す
    let node = heroScene.getObjectByName(nodeName);

    if (!node) {
      // なければ親ボーンに空ノードを追加
      const parentBoneName = MOUNT_PARENT_BONES[mountId as MountPointId];
      const parent = heroScene.getObjectByName(parentBoneName);
      if (parent) {
        node = new THREE.Group();
        node.name = nodeName;
        parent.add(node);
      }
    }

    result[mountId] = node ?? null;
  }

  return result as Record<MountPointId, THREE.Object3D | null>;
};
```

---

### Attachment State

#### [MODIFY] [useFSMStore.ts](file:///Users/you/code/plaresAR/frontend/src/store/useFSMStore.ts)

装備スロットの状態管理を追加：

```typescript
interface AttachmentSlot {
  mountPoint: MountPointId;
  glbUrl: string;          // 装備のGLB URL
  label: string;           // 表示名（例: "揚げ春巻きソード"）
  scale: number;           // スケール倍率
}

// FSMState に追加
attachments: AttachmentSlot[];
setAttachment: (slot: AttachmentSlot) => void;
removeAttachment: (mountPoint: MountPointId) => void;
```

---

### Attachment Manager Hook

#### [NEW] [useAttachmentManager.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/useAttachmentManager.ts)

```typescript
/**
 * マウントポイントに装備GLBを着脱するReact Hook。
 * - GLTFLoaderで装備GLBを非同期読み込み
 * - バウンディングボックスで自動スケール正規化
 * - マウントポイントに対してadd/removeで着脱
 * - unmount時に geometry/material を dispose
 */
export const useAttachmentManager = (
  heroScene: THREE.Group | null,
  attachments: AttachmentSlot[],
) => {
  // 実装: マウントポイントの参照取得 → 装備GLBロード → 正規化 → add
};
```

---

## Phase 4: 顔写真ラッピング

> 初回の顔スキャン写真をロボットの頭部/バイザーに投影する。

---

### Approach

既存の `skinUrl` メカニズムを拡張する2段階アプローチ：

**Stage A（即時）**: 顔写真 → AI処理 → ロボットスキン全体テクスチャ生成 → `skinUrl` にセット

**Stage B（後日）**: 頭部領域のみに顔をUVプロジェクション

---

### Stage A 実装

#### [NEW] [useFaceTexture.ts](file:///Users/you/code/plaresAR/frontend/src/hooks/useFaceTexture.ts)

```typescript
/**
 * 顔写真Base64 → バックエンドのテクスチャ生成API → skinUrl をDNAに反映。
 * 
 * フロー:
 * 1. useCharacterSetup で撮影した顔写真を受取
 * 2. バックエンドに送信してロボット風テクスチャを生成
 * 3. 生成されたURL を setRobotDna({ ...dna, skinUrl }) で適用
 */
export const useFaceTexture = (
  faceImageBase64: string | null,
  onSkinReady: (url: string) => void,
) => { /* ... */ };
```

#### [MODIFY] [useRobotAppearance.ts](file:///Users/you/code/plaresAR/frontend/src/components/robot/useRobotAppearance.ts)

既存の `skinUrl` テクスチャロードロジック（L101-130）は既に動作するため、変更は不要。`skinUrl` がセットされれば自動的にテクスチャが全メッシュに適用される。

---

### Stage B 実装（頭部限定プロジェクション）

#### [NEW] [headProjectionMaterial.ts](file:///Users/you/code/plaresAR/frontend/src/utils/headProjectionMaterial.ts)

```typescript
/**
 * Head ボーンに紐付く頂点のみに対して、
 * 顔写真をカメラプロジェクション方式で投影するカスタムマテリアル。
 *
 * ShaderMaterial を使い、Head ボーンのウェイトが閾値以上の頂点にのみ
 * 第二UV（プロジェクションUV）で顔テクスチャをブレンドする。
 */
```

> [!IMPORTANT]
> Stage B はシェーダーのカスタマイズが必要で複雑度が高い。Stage Aで体験価値を確認してから着手することを推奨。

---

## Phase 5: 動的スキャン装備パイプライン

>  カメラスキャン → AI 3D生成 → 装備着装の一気通貫フロー。

---

### Backend API

#### [NEW] [equipment_generator.py](file:///Users/you/code/plaresAR/backend/ai_core/equipment_generator.py)

```python
"""
画像 + プロンプト → AI 3D GLB を生成するバックエンドエンドポイント。

エンドポイント: POST /api/generate-equipment
Input:  { image_base64: str, prompt: str, mount_point: str }
Output: { glb_url: str, label: str }

内部フロー:
1. 画像 + プロンプトを Nano Banana Pro / Meshy API に送信
2. 生成結果を Cloud Storage に保存
3. GLB URL を返却
"""
```

#### [MODIFY] [main.py](file:///Users/you/code/plaresAR/backend/main.py)

新エンドポイント `/api/generate-equipment` の追加。

---

### Frontend Flow

#### [NEW] [ScanEquipmentFlow.tsx](file:///Users/you/code/plaresAR/frontend/src/components/ui/ScanEquipmentFlow.tsx)

スキャン → 装備化のUIフロー：

```
1. カメラ起動（既存ARカメラ流用）
2. シャッター → 画像取得
3. マウントポイント選択（4箇所）
4. プロンプト入力（"剣", "盾" 等）
5. /api/generate-equipment API呼び出し
6. ローディング → 完了後自動装着
```

#### [NEW] [equipmentNormalizer.ts](file:///Users/you/code/plaresAR/frontend/src/utils/equipmentNormalizer.ts)

AI生成GLBの正規化ユーティリティ：

```typescript
/**
 * AI生成GLBはスケール・原点がバラバラなため、
 * バウンディングボックスを基に以下を自動調整：
 * - 原点をモデル底面中心に移動
 * - 最大寸法が指定サイズ内に収まるようスケール
 * - Y軸が上方向になるよう回転補正
 */
export const normalizeEquipmentGlb = (scene: THREE.Group, targetSize = 0.3) => {
  // ...
};
```

---

## User Review Required

> [!WARNING]
> **Phase 1 の GLB モデル調達**: 6体の専用GLBモデルはMeshy AIで生成する前提ですが、完成するまで既存A/Bモデルを`MODEL_GLB_PATH`マッピングで代用します。見た目の差異は PBR チューニングとボーンスケールで表現されます。新モデルが完成次第、パスを差し替えるだけで切替可能です。

> [!IMPORTANT]
> **Phase 5 の AI 3D生成API**: Nano Banana Pro等の具体的なAPI選定と、Cloud Storage の構成が必要です。この部分は実装時にAPI仕様を確認して最終決定します。

---

## Verification Plan

### Phase 1 検証

1. **`npm run build`** — TypeScript コンパイルエラーがないこと
   ```bash
   cd /Users/you/code/plaresAR/frontend && npm run build
   ```

2. **ブラウザ検証（dev server）** — BattlePrepOverlay で6種のモデル選択ボタンが表示されること
   ```bash
   cd /Users/you/code/plaresAR/frontend && npm run dev
   ```
   - ブラウザで開く → Battle Prep 画面に遷移 → 6種のモデル選択ボタンが表示される
   - 各ボタンをクリック → モデル切替が反映される

### Phase 2 検証

1. **ブラウザ検証** — パワーが高いキャラの腕が太く表示されること
   - dev server 起動 → デバッグUIでステータスを変更 → ボーンが連動して変形することを確認

### Phase 3 検証

1. **ブラウザ検証** — マウントポイントが正しく注入されること
   - dev server → コンソールで `heroScene.getObjectByName('Node_Weapon_R')` が存在確認
   - テスト用の簡易メッシュ（BoxGeometry）をマウントポイントに attach → 右手に追従すること

### Phase 4-5 検証

> [!NOTE]
> Phase 4-5はバックエンドAPIとの連携が必要なため、ユーザーによる手動テスト（端末でカメラ起動→スキャン→装備確認）で検証を推奨します。具体的なテスト手順はPhase 4-5実装時に策定します。
