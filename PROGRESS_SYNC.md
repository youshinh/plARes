# PROGRESS_SYNC.md

最終更新: 2026-03-01

## 運用ルール

- 着手時に Status を `IN_PROGRESS` へ
- 完了時（DoDを満たした上で）`DONE` へ
- ブロッカー発生時は Blocker 欄に必ず理由を記載する

| Date       | Owner    | TaskID | Directory                   | Status | NextAction                                              | Blocker |
| ---------- | -------- | ------ | --------------------------- | ------ | ------------------------------------------------------- | ------- |
| 2026-03-01 | Codex    | T1-17  | /frontend/src               | DONE   | 修行/散歩モード導線実装（モード切替、開始/完了、walk_vision_trigger送信、HUD表示） | なし    |
| 2026-03-01 | Codex    | T1-16  | /backend, /docs, /cloudbuild | DONE   | Gemini APIキーを `GEMINI_API_KEY` に統一（コード参照先 + Cloud Build secrets + checklist更新） | なし    |
| 2026-03-01 | Codex    | T1-15  | /frontend/src, /backend/ai_core | DONE   | 生成レスポンス正規化でstats欠落クラッシュ防止 + MediaPipe URL修正(0.10.20) + WS未接続時sync圧縮 | なし    |
| 2026-03-01 | Codex    | T1-14  | /frontend/src               | DONE   | AR対応判定(isSessionSupported)追加 + iPhone等非対応端末でARボタン無効化と代替案内 | なし    |
| 2026-03-01 | Codex    | T1-13  | /frontend/src               | DONE   | AR時の床CG非表示(VR/非XRのみ表示) + 音声コマンド受理ミニ表示HUD追加 | なし    |
| 2026-03-01 | Codex    | T1-12  | /frontend/src               | DONE   | AudioWorklet移行(2系統) + XR presenting中resizeガード + Android影描画抑制 | なし    |
| 2026-03-01 | Codex    | T1-11  | /frontend/src               | DONE   | NavMesh API不整合時の無効化フォールバック + 音声必殺トリガー追加 + Voice再試行安定化 | なし    |
| 2026-03-01 | Codex    | T1-10  | /frontend/src               | DONE   | WS open前送信のキュー化 + PCFSoftShadowMap警告の抑制設定 | なし    |
| 2026-03-01 | Codex    | T1-9   | /frontend/src, /frontend    | DONE   | recast.wasm配信経路修正（Vite URL解決+Nginx wasm静的配信） | なし    |
| 2026-03-01 | Codex    | T1-8   | /frontend/src               | DONE   | Pixel向け安定化: depthSensing要求をOFFに変更（hit-test優先） | なし    |
| 2026-03-01 | Codex    | T1-7   | /frontend/src               | DONE   | Depth未対応セッションでの例外停止防止 + 不要XR機能要求/レンダーログ抑制 | なし    |
| 2026-03-01 | Codex    | T1-6   | /frontend/src               | DONE   | AR平面検出失敗時の強制フォールバック追加 + HUDにAR状態表示追加 | なし    |
| 2026-03-01 | Codex    | T1-5   | /frontend/src               | DONE   | WebXR平面検出フォールバック + ARセッション復帰時状態リセット実装 | なし    |
| 2026-03-01 | Codex    | V-2    | /.claude/skills, /docs      | DONE   | skills origin明記 + performance_cost_report のモデル整合 | なし    |
| 2026-03-01 | Codex    | V-1    | /backend/tests, /scripts    | DONE   | test_streaming安定化 + e2eクリック遮断フォールバック実装 | なし    |
| 2026-03-01 | Agent3   | T0-4   | /.claude/skills             | DONE   | ECC由来6skillをplARes向けに改修・追加                 | なし    |
| 2026-03-01 | -        | T3-4   | /backend/infrastructure     | DONE   | 削除完了（bidi_stream/state_manager/models等5ファイル） | なし    |
| 2026-03-01 | -        | T3-5   | /backend/requirements.txt   | DONE   | pubsub/storage/pytest-asyncio 追加済み                  | なし    |
| 2026-03-01 | Agent2   | T0-2   | /backend/tests              | DONE   | test_streaming.py import修正完了                        | なし    |
| 2026-03-01 | Agent1   | T1-1   | /frontend/src/App.tsx       | DONE   | MainScene→RemoteRobotCharacter depth props配線完了      | なし    |
| 2026-03-01 | Agent3   | T0-1   | /PROGRESS_SYNC.md           | DONE   | このファイルを作成                                      | なし    |
| 2026-03-01 | Agent3   | T0-3   | /.github/workflows          | DONE   | backend-ci.yml作成（py_compile + pytest）               | なし    |
| 2026-03-01 | Agent1   | T1-2   | /frontend/src/components    | DONE   | patchDepthOcclusionMaterial呼び出し+occlusionRef登録    | なし    |
| 2026-03-01 | Agent1   | T1-3   | /frontend/src/components/ui | DONE   | P1/P2/P3バッジ+遷移ログ追加・useFSMStore拡張            | なし    |
| 2026-03-01 | Agent1   | T1-4   | /frontend/src/hooks         | DONE   | ScanState型+ScanGuideOverlay+CustomEvent配線完了        | なし    |
| 2026-03-01 | Agent2   | T2-1   | /docs                       | DONE   | architecture_live.md作成（PathA/B定義・禁止事項明記）   | なし    |
| 2026-03-01 | Agent2   | T2-2   | /backend/ai_core/main.py    | DONE   | env変数化(3定数)+structured JSONログ追加・3テストpass   | なし    |
| 2026-03-01 | Agent2   | T2-3   | /backend/ai_core            | DONE   | error_code(5種)+is_fallback追加・UI警告表示実装         | なし    |
| 2026-03-01 | Agent1+2 | T2-4   | /frontend/src/App.tsx       | DONE   | ハンドラ既存確認+BGM再生useEffect追加                   | なし    |
| 2026-03-01 | Agent3   | T3-1   | /backend/infrastructure     | DONE   | genai SDK実API化(Imagen/Lyria)+Pub/Sub+graceful降格     | なし    |
| 2026-03-01 | Agent3   | T3-2   | /backend/infrastructure     | DONE   | 入力サニタイズ+FIRESTORE_MODE fallback+JSONログ追加     | なし    |
| 2026-03-01 | Agent3   | T3-3   | /backend/infrastructure     | DONE   | TTL env化+hit/miss JSONログ+モデル名gemini-3更新        | なし    |
| 2026-03-01 | All      | T4-1   | /scripts                    | DONE   | 対戦シナリオ+HP検証+match_logカウント+サマリ出力追加    | なし    |
| 2026-03-01 | Agent3   | T4-2   | /docs                       | DONE   | APIレイテンシ+コスト+最適化+structured log一覧          | なし    |
| 2026-03-01 | Agent3   | T4-3   | /docs                       | DONE   | Pre/Deploy/Post 3フェーズチェックリスト作成             | なし    |

## ステータス定義

| Status        | 説明                                  |
| ------------- | ------------------------------------- |
| `TODO`        | 未着手                                |
| `IN_PROGRESS` | 実装中                                |
| `BLOCKED`     | 依存待ち（Blocker欄に必ず理由を記載） |
| `DONE`        | DoD達成済み                           |
