# PROGRESS_SYNC.md

最終更新: 2026-03-01

## 運用ルール

- 着手時に Status を `IN_PROGRESS` へ
- 完了時（DoDを満たした上で）`DONE` へ
- ブロッカー発生時は Blocker 欄に必ず理由を記載する

| Date       | Owner    | TaskID | Directory                   | Status | NextAction                                              | Blocker |
| ---------- | -------- | ------ | --------------------------- | ------ | ------------------------------------------------------- | ------- |
| 2026-03-01 | -        | T3-4   | /backend/infrastructure     | DONE   | 削除完了（bidi_stream/state_manager/models等5ファイル） | なし    |
| 2026-03-01 | -        | T3-5   | /backend/requirements.txt   | DONE   | pubsub/storage/pytest-asyncio 追加済み                  | なし    |
| 2026-03-01 | Agent2   | T0-2   | /backend/tests              | DONE   | test_streaming.py import修正完了                        | なし    |
| 2026-03-01 | Agent1   | T1-1   | /frontend/src/App.tsx       | DONE   | MainScene→RemoteRobotCharacter depth props配線完了      | なし    |
| 2026-03-01 | Agent3   | T0-1   | /PROGRESS_SYNC.md           | DONE   | このファイルを作成                                      | なし    |
| 2026-03-01 | Agent3   | T0-3   | /.github/workflows          | DONE   | backend-ci.yml作成（py_compile + pytest）               | なし    |
| 2026-03-01 | Agent1   | T1-2   | /frontend/src/components    | DONE   | patchDepthOcclusionMaterial呼び出し+occlusionRef登録    | なし    |
| -          | Agent1   | T1-3   | /frontend/src/components/ui | TODO   | FSM debug panel強化                                     | なし    |
| -          | Agent1   | T1-4   | /frontend/src/hooks         | TODO   | AR平面未検出ガイド（scanState返却）                     | なし    |
| 2026-03-01 | Agent2   | T2-1   | /docs                       | DONE   | architecture_live.md作成（PathA/B定義・禁止事項明記）   | なし    |
| -          | Agent2   | T2-2   | /backend/ai_core/main.py    | TODO   | 音声判定パラメータenv化・structured log追加             | なし    |
| -          | Agent2   | T2-3   | /backend/ai_core            | TODO   | キャラ生成API失敗時エラーコード追加                     | なし    |
| 2026-03-01 | Agent1+2 | T2-4   | /frontend/src/App.tsx       | DONE   | ハンドラ既存確認+BGM再生useEffect追加                   | なし    |
| -          | Agent3   | T3-1   | /backend/infrastructure     | TODO   | multimodal_pipeline 本実装（Imagen/Pub/Sub）            | なし    |
| -          | Agent3   | T3-2   | /backend/infrastructure     | TODO   | MCP Tool実行系検証                                      | なし    |
| -          | Agent3   | T3-3   | /backend/infrastructure     | TODO   | Context Cache ヒット率ログ追加・モデル名修正            | なし    |
| -          | All      | T4-1   | /scripts                    | TODO   | e2e_live_smoke.sh 対戦シナリオ追加                      | なし    |
| -          | Agent3   | T4-2   | /docs                       | TODO   | 性能・コスト実測レポート                                | なし    |
| -          | Agent3   | T4-3   | /docs                       | TODO   | リリースチェックリスト作成                              | なし    |

## ステータス定義

| Status        | 説明                                  |
| ------------- | ------------------------------------- |
| `TODO`        | 未着手                                |
| `IN_PROGRESS` | 実装中                                |
| `BLOCKED`     | 依存待ち（Blocker欄に必ず理由を記載） |
| `DONE`        | DoD達成済み                           |
