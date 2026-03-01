---
name: ui-polisher
description: |
  「Screenshot → Gemini Design Critique → Refine」の自動ループを実行するビジュアル磨き上げスキル。
  Agent 1（フロントエンド）がUI実装を完了した直後に呼び出し、プロ品質の視覚的仕上げを行う。
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
  tags: [design, visual-qa, multimodal, polisher]
---

# UI Polisher Skill — Visual Feedback Loop

このスキルは **「実装担当（Implementer）」** が書いたUIを、
**「磨き上げ担当（Polisher）」** として自動的にレビュー・修正するためのループを定義します。

> 参考思想: Apple Human Interface Guidelines / Material Design 3 Elevation System / WCAG 2.2 AA

---

## When to Use This Skill

- Agent 1 が React / Three.js / CSS のUI実装を完了した直後。
- 「動くが美しくない」状態のコードを仕上げるとき。
- AR オーバーレイのグラスモーフィズムや Shadow Elevation を洗練させるとき。
- デザイントークン（色・間隔・タイポグラフィ）が場当たり的になっているとき。

---

## The Visual Feedback Loop (3 Steps)

### STEP 1 — Generate Screenshot

ヘッドレスブラウザ（Playwright）を使い、現在の描画結果を画像として取得する。

```bash
# スクリプト: skills/agent1/ui-polisher/scripts/capture.sh
npx playwright screenshot \
  --browser chromium \
  --viewport-size "390,844" \
  http://localhost:5173 \
  /tmp/ui_snapshot_$(date +%s).png
```

- ビューポートはモバイル優先（390×844 = iPhone 15 相当）。
- 複数の状態（初期表示 / AR戦闘中 / 勝利画面）をそれぞれキャプチャすること。

### STEP 2 — Gemini Multimodal Design Critique

取得した画像を Gemini に投げ、以下の **デザイン批評プロンプト** でレビューさせる。

```text
[SYSTEM]
あなたはプロのUIデザイナーです。Apple HIG / Material Design 3 / WCAG 2.2 AA の基準で
AR ゲームUIを評価してください。

[USER]
添付画像は plARes のゲームUIです。以下の観点で問題点を列挙し、
具体的なCSS/コードの修正案を出力してください。

1. Optical Alignment（数学的中央ではなく、視覚的に中央に見えるか）
2. Shadow & Elevation（Soft Shadow が多層に重なっているか / ベタ塗りになっていないか）
3. Typography Hierarchy（font-weight / letter-spacing で情報優先度が表現されているか）
4. Glassmorphism Quality（backdrop-blur が十分か / アルファ値は適切か）
5. Color Contrast（WCAG AA 基準: テキストは 4.5:1 以上のコントラスト比を満たすか）
6. Micro-animation（ホバー・タップ時に transition があるか / easing は cubic-bezier か）
7. AR Overlay Safety（画面中央のAR戦闘エリアを UI が侵食していないか）

出力形式:
- 問題点: [具体的な要素名と座標]
- 修正CSS: [コードブロック]
- 優先度: [High/Medium/Low]
```

### STEP 3 — Auto-Refine

Gemini の出力を受け取り、以下のルールで自動的にコードを修正する。

#### 3a. Shadow / Elevation の標準テンプレート

```css
/* Elevation Level 1: 浮き要素（ボタン、カード） */
.elevated-1 {
  box-shadow:
    0 1px 2px hsl(0 0% 0% / 0.07),
    0 2px 4px hsl(0 0% 0% / 0.07),
    0 4px 8px hsl(0 0% 0% / 0.07);
}

/* Elevation Level 2: モーダル、パネル */
.elevated-2 {
  box-shadow:
    0 1px 3px hsl(0 0% 0% / 0.12),
    0 4px 8px hsl(0 0% 0% / 0.1),
    0 8px 24px hsl(0 0% 0% / 0.08),
    0 16px 48px hsl(0 0% 0% / 0.06);
}

/* Elevation Level 3: AR上の最前面パネル（Glassmorphism） */
.ar-panel {
  background: hsl(0 0% 100% / 0.08);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid hsl(0 0% 100% / 0.15);
  box-shadow:
    0 0 0 1px hsl(0 0% 0% / 0.05),
    0 8px 32px hsl(0 0% 0% / 0.2),
    inset 0 1px 0 hsl(0 0% 100% / 0.1);
}
```

#### 3b. Typography スケールの強制適用

```css
/* plARes Design Token: Typography */
:root {
  --text-display: clamp(2rem, 5vw, 3.5rem); /* ヒーローテキスト */
  --text-title: clamp(1.25rem, 3vw, 1.75rem);
  --text-body: 1rem;
  --text-caption: 0.75rem;

  --weight-black: 900;
  --weight-bold: 700;
  --weight-medium: 500;
  --weight-normal: 400;

  /* 情報密度に応じてtrackingを調整 */
  --tracking-tight: -0.02em; /* 大きなタイトル用 */
  --tracking-normal: 0em;
  --tracking-wide: 0.08em; /* キャプション・ラベル用 */
  --tracking-widest: 0.15em; /* ALL CAPS モノスペース */
}
```

#### 3c. Micro-animation の強制適用

```css
/* すべてのインタラクティブ要素に適用 */
button,
[role="button"],
.interactive {
  transition:
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
    /* spring */ box-shadow 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
    background 150ms ease,
    opacity 150ms ease;
}

button:hover {
  transform: translateY(-2px);
}

button:active {
  transform: translateY(0) scale(0.97);
  transition-duration: 80ms;
}
```

#### 3d. Optical Alignment 補正

```css
/*
 * 数学的中央（50%）は視覚的に下に見える。
 * アイコンやロゴは padding-top を 0.5em 余分に与えると
 * 視覚的に中央に見える。
 */
.visually-centered {
  display: flex;
  align-items: center;
  padding-bottom: 0.1em; /* 視覚補正: キャップハイト差の吸収 */
}

/* AR座標でのラベル: カメラ近くの要素は下に見えやすいため上方向にオフセット */
.ar-label-offset {
  transform: translateY(-6px);
}
```

---

## Design Critique Output Format

Gemini を呼び出した後、以下のフォーマットで批評結果を `docs/design-critique-log.md` に追記する。

```markdown
## [YYYY-MM-DD HH:MM] UI Critique Run

**Screenshot**: `/tmp/ui_snapshot_<timestamp>.png`
**Viewport**: 390x844 (Mobile)

| #   | 問題箇所                            | 観点            | 優先度 | 修正済み |
| --- | ----------------------------------- | --------------- | ------ | -------- |
| 1   | `.ar-panel` の blur 値が 8px で弱い | Glassmorphism   | High   | ✅       |
| 2   | ボタンに transition なし            | Micro-animation | Medium | ✅       |
| 3   | HP バー文字のコントラスト比 3.2:1   | WCAG AA         | High   | ✅       |
```

---

## Integration Points

| トリガー            | 説明                                    |
| ------------------- | --------------------------------------- |
| `npm run dev` 後    | 開発サーバー起動後に自動キャプチャ      |
| Git pre-commit hook | コミット前にスナップショット比較        |
| Agent 1 実装完了後  | 明示的に `ui-polisher` スキルを呼び出す |

---

## Instructions for Agent

1. **スクリーンショット取得**: `scripts/capture.sh` を実行し、画像パスを変数に格納する。
2. **Gemini 呼び出し**: `generate_image` ツールまたは multimodal query で画像を投げる。
3. **批評の解析**: 出力から `High` 優先度の問題を抽出する。
4. **コード修正**: 上記テンプレートを基準に、対象ファイルを `multi_replace_file_content` で修正する。
5. **ログ記録**: `docs/design-critique-log.md` に結果を追記する。
6. **再キャプチャ**: 修正後に再度 STEP 1 に戻り、改善を確認する（最大 2 ループ）。

> **STOP 条件**: 全 High 優先度問題が修正されるか、2ループ実行されたら停止する。

---

## References

- [Apple HIG — Visual Design](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design 3 — Elevation](https://m3.material.io/styles/elevation/overview)
- [WCAG 2.2 — Contrast Minimum (1.4.3)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [cubic-bezier.com — Easing explorer](https://cubic-bezier.com/)
