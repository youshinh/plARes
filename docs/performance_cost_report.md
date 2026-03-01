# 性能・コスト実測レポート

最終更新: 2026-03-01

## 概要

PlaresAR の各 Gemini API 呼び出しに対する推定レイテンシ・コスト指標。
実測値は本番デプロイ後に更新すること。

## API呼び出し一覧

| 機能                    | モデル                                           | 入力トークン (推定) | 出力トークン (推定) | レイテンシ目標 | 実測値 |
| ----------------------- | ------------------------------------------------ | ------------------- | ------------------- | -------------- | ------ |
| 実況生成 (Live)         | gemini-2.5-flash-native-audio-preview-12-2025   | ~2,000              | ~200                | < 500ms        | TBD    |
| キャラクター生成        | gemini-3-flash-preview                           | ~1,500              | ~200                | < 3s           | TBD    |
| 音声判定 (Voice Judge)  | gemini-2.5-flash-native-audio-preview-12-2025   | ~500                | ~50                 | < 1s           | TBD    |
| Context Cache 作成      | gemini-3-flash-preview                           | ~32,000             | 0                   | < 5s           | TBD    |
| テクスチャ融合 (Imagen) | gemini-3.1-flash-image-preview                   | ~100 + image        | 1 image             | < 2s           | TBD    |
| 勝利BGM (Music/TTS)     | gemini-2.5-flash-preview-tts                     | ~200                | audio               | < 10s          | TBD    |

## コスト見積もり（月間1,000アクティブユーザー想定）

| 項目                 | 単位コスト           | 月間使用量    | 月額推定 |
| -------------------- | -------------------- | ------------- | -------- |
| Gemini Flash 入力    | $0.075/1M tokens     | ~50M tokens   | ~$3.75   |
| Gemini Flash 出力    | $0.30/1M tokens      | ~5M tokens    | ~$1.50   |
| Context Cache (割引) | ~70% off input       | ~30M tokens   | ~$0.68   |
| Imagen 画像生成      | $0.02/image          | ~5,000 images | ~$100    |
| Lyria 音楽生成       | TBD                  | ~3,000 clips  | TBD      |
| Cloud Run (backend)  | $0.00002400/vCPU-sec | ~720h         | ~$62     |
| Cloud Run (frontend) | $0.00002400/vCPU-sec | ~720h         | ~$62     |

**推定月額合計: ~$230 + Lyria TBD**

## 最適化ポイント

1. **Context Cache**: TTL=3600s で同一ユーザーの連続対戦でキャッシュヒット → 入力コスト70%削減
2. **Voice Judge**: PCM amplitude のみで判定可能な場合は GenAI 呼び出しスキップ
3. **Imagen**: 結果をGCSにキャッシュして同一コンセプトの再生成を防止
4. **Lyria**: 勝利時のみ生成（敗北時はプリセットBGM使用）

## モニタリング

以下の structured JSON ログで Cloud Logging からダッシュボード構築可能:

```
event=voice_judge    → 音声判定の精度・速度
event=context_cache  → キャッシュヒット率
event=character_generation → キャラ生成成功率
event=reality_fusion → テクスチャ生成状況
event=lyria_music    → BGM生成状況
event=mcp_tool_*     → MCP Tool 実行状況
```
