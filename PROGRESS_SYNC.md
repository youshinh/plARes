# PROGRESS_SYNC.md

最終更新: 2026-03-07

## 運用ルール

- 着手時に Status を `IN_PROGRESS` へ
- 完了時（DoDを満たした上で）`DONE` へ
- ブロッカー発生時は Blocker 欄に必ず理由を記載する

| Date       | Owner    | TaskID | Directory                       | Status | NextAction                                                                                      | Blocker |
| ---------- | -------- | ------ | ------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ------- |
| 2026-03-07 | Codex    | T2-15  | /backend/ai_core, /backend/tests | DONE   | `main.py` の最終整理として composition 重複を削減し、backend test 55件を維持                   | なし    |
| 2026-03-07 | Codex    | T2-14  | /backend/ai_core, /backend/tests | DONE   | `genai_helpers.py` 抽出と packet contract 厳密化を追加し、`main.py` を1082行まで整理して backend testを55件まで拡張 | なし    |
| 2026-03-07 | Codex    | T2-13  | /backend/ai_core, /backend/tests | DONE   | `genai_client_factory.py` / `platform_bootstrap.py` / `message_contracts.py` を追加し、bootstrap整理と packet contract validation を導入して backend testを51件まで拡張 | なし    |
| 2026-03-07 | Codex    | T2-12  | /backend/ai_core, /backend/tests | DONE   | `character_session_service.py` / `ui_payloads.py` 抽出で character接続とUI helperを分離し、backend testを45件まで拡張 | なし    |
| 2026-03-07 | Codex    | T2-11  | /backend/ai_core, /backend/tests | DONE   | `audio_session_service.py` / `game_session_service.py` 抽出で接続ライフサイクルを分離し、backend testを39件まで拡張 | なし    |
| 2026-03-07 | Codex    | T2-10  | /backend/ai_core, /backend/tests | DONE   | `genai_request_service.py` / `ws_router.py` 抽出で GenAI request処理とWS router/bootstrap を分離し、backend testを37件まで拡張 | なし    |
| 2026-03-07 | Codex    | T2-9   | /backend/ai_core, /backend/tests | DONE   | `persistence_service.py` / `runtime_service.py` 抽出で Firestore と room/session 管理を分離し、backend testを29件まで拡張 | なし    |
| 2026-03-06 | Codex    | T2-8   | /backend/ai_core, /backend/tests | DONE   | `GameApplicationDeps` 導入 + `dialogue_service.py` 抽出 + game_application contract test追加   | なし    |
| 2026-03-06 | Codex    | T2-7   | /backend/ai_core, /backend/tests | DONE   | `battle_service.py` 抽出で HP/EX/heat/match_end を分離し、backend testを20件まで拡張          | なし    |
| 2026-03-06 | Codex    | T2-6   | /backend/ai_core, /backend/tests | DONE   | `audio_judge.py` / `profile_service.py` / `game_application.py` へ分割し、backend testを18件まで拡張 | なし    |
| 2026-03-06 | Codex    | T2-5   | /backend/ai_core, /backend/tests | DONE   | `main.py` の runtime bug修正（base64/import名揺れ/保存呼び出し）+ 回帰テスト4件追加            | なし    |
| 2026-03-06 | Codex    | T1-21  | /frontend/src, /frontend        | DONE   | `App.tsx` hook分割継続 + HUD重なり修正 + Playwrightで Walk→Training→Battle Prep→Match を再確認 | なし    |
| 2026-03-06 | Codex    | T1-20  | /frontend/src                   | DONE   | `App.tsx` の画面責務分割継続 + `RobotCharacter.tsx` を asset/appearance/animation hook へ分離 | なし    |
| 2026-03-06 | Codex    | T1-19  | /frontend/src/App.tsx           | DONE   | React warning（setState in render）を解消し、Flow main遷移の安定動作をPlaywrightで再確認       | なし    |
| 2026-03-03 | Codex    | T1-18  | /frontend/src, /frontend        | DONE   | Flow準拠のハブ導線実装（hub追加、散歩/修行/対戦の明示遷移、常時バトルHUD廃止、UI再設計）        | なし    |
| 2026-03-02 | Jules    | J-6    | /frontend/src                   | DONE   | HUD/パネルボタンのキーボードアクセシビリティ改善                                                | なし    |
| 2026-03-02 | Jules    | J-1    | /backend                        | DONE   | ログパスのトラバーサル脆弱性修正（Sentinel）                                                    | なし    |
| 2026-03-01 | Jules    | J-2    | /backend/ai_core                | DONE   | ハートビートWatchdogの辞書反復処理最適化                                                        | なし    |
| 2026-03-01 | Jules    | J-3    | /backend                        | DONE   | バックエンド全体の構造リファクタリング、保守性向上                                              | なし    |
| 2026-03-01 | Jules    | J-4    | /backend/ai_core, /tests        | DONE   | \_safe_json_loads の安全なパース検証とユニットテスト追加                                        | なし    |
| 2026-03-01 | Jules    | J-5    | /backend/infrastructure         | DONE   | asyncio.wrap_future によるPub/Sub呼び出しの非同期最適化                                         | なし    |
| 2026-03-01 | Codex    | T1-17  | /frontend/src                   | DONE   | 修行/散歩モード導線実装（モード切替、開始/完了、walk_vision_trigger送信、HUD表示）              | なし    |
| 2026-03-01 | Codex    | T1-16  | /backend, /docs, /cloudbuild    | DONE   | Gemini APIキーを `GEMINI_API_KEY` に統一（コード参照先 + Cloud Build secrets + checklist更新）  | なし    |
| 2026-03-01 | Codex    | T1-15  | /frontend/src, /backend/ai_core | DONE   | 生成レスポンス正規化でstats欠落クラッシュ防止 + MediaPipe URL修正(0.10.20) + WS未接続時sync圧縮 | なし    |
| 2026-03-01 | Codex    | T1-14  | /frontend/src                   | DONE   | AR対応判定(isSessionSupported)追加 + iPhone等非対応端末でARボタン無効化と代替案内               | なし    |
| 2026-03-01 | Codex    | T1-13  | /frontend/src                   | DONE   | AR時の床CG非表示(VR/非XRのみ表示) + 音声コマンド受理ミニ表示HUD追加                             | なし    |
| 2026-03-01 | Codex    | T1-12  | /frontend/src                   | DONE   | AudioWorklet移行(2系統) + XR presenting中resizeガード + Android影描画抑制                       | なし    |
| 2026-03-01 | Codex    | T1-11  | /frontend/src                   | DONE   | NavMesh API不整合時の無効化フォールバック + 音声必殺トリガー追加 + Voice再試行安定化            | なし    |
| 2026-03-01 | Codex    | T1-10  | /frontend/src                   | DONE   | WS open前送信のキュー化 + PCFSoftShadowMap警告の抑制設定                                        | なし    |
| 2026-03-01 | Codex    | T1-9   | /frontend/src, /frontend        | DONE   | recast.wasm配信経路修正（Vite URL解決+Nginx wasm静的配信）                                      | なし    |
| 2026-03-01 | Codex    | T1-8   | /frontend/src                   | DONE   | Pixel向け安定化: depthSensing要求をOFFに変更（hit-test優先）                                    | なし    |
| 2026-03-01 | Codex    | T1-7   | /frontend/src                   | DONE   | Depth未対応セッションでの例外停止防止 + 不要XR機能要求/レンダーログ抑制                         | なし    |
| 2026-03-01 | Codex    | T1-6   | /frontend/src                   | DONE   | AR平面検出失敗時の強制フォールバック追加 + HUDにAR状態表示追加                                  | なし    |
| 2026-03-01 | Codex    | T1-5   | /frontend/src                   | DONE   | WebXR平面検出フォールバック + ARセッション復帰時状態リセット実装                                | なし    |
| 2026-03-01 | Codex    | V-2    | /.claude/skills, /docs          | DONE   | skills origin明記 + performance_cost_report のモデル整合                                        | なし    |
| 2026-03-01 | Codex    | V-1    | /backend/tests, /scripts        | DONE   | test_streaming安定化 + e2eクリック遮断フォールバック実装                                        | なし    |
| 2026-03-01 | Agent3   | T0-4   | /.claude/skills                 | DONE   | ECC由来6skillをplARes向けに改修・追加                                                           | なし    |
| 2026-03-01 | -        | T3-4   | /backend/infrastructure         | DONE   | 削除完了（bidi_stream/state_manager/models等5ファイル）                                         | なし    |
| 2026-03-01 | -        | T3-5   | /backend/requirements.txt       | DONE   | pubsub/storage/pytest-asyncio 追加済み                                                          | なし    |
| 2026-03-01 | Agent2   | T0-2   | /backend/tests                  | DONE   | test_streaming.py import修正完了                                                                | なし    |
| 2026-03-01 | Agent1   | T1-1   | /frontend/src/App.tsx           | DONE   | MainScene→RemoteRobotCharacter depth props配線完了                                              | なし    |
| 2026-03-01 | Agent3   | T0-1   | /PROGRESS_SYNC.md               | DONE   | このファイルを作成                                                                              | なし    |
| 2026-03-01 | Agent3   | T0-3   | /.github/workflows              | DONE   | backend-ci.yml作成（py_compile + pytest）                                                       | なし    |
| 2026-03-01 | Agent1   | T1-2   | /frontend/src/components        | DONE   | patchDepthOcclusionMaterial呼び出し+occlusionRef登録                                            | なし    |
| 2026-03-01 | Agent1   | T1-3   | /frontend/src/components/ui     | DONE   | P1/P2/P3バッジ+遷移ログ追加・useFSMStore拡張                                                    | なし    |
| 2026-03-01 | Agent1   | T1-4   | /frontend/src/hooks             | DONE   | ScanState型+ScanGuideOverlay+CustomEvent配線完了                                                | なし    |
| 2026-03-01 | Agent2   | T2-1   | /docs                           | DONE   | architecture_live.md作成（PathA/B定義・禁止事項明記）                                           | なし    |
| 2026-03-01 | Agent2   | T2-2   | /backend/ai_core/main.py        | DONE   | env変数化(3定数)+structured JSONログ追加・3テストpass                                           | なし    |
| 2026-03-01 | Agent2   | T2-3   | /backend/ai_core                | DONE   | error_code(5種)+is_fallback追加・UI警告表示実装                                                 | なし    |
| 2026-03-01 | Agent1+2 | T2-4   | /frontend/src/App.tsx           | DONE   | ハンドラ既存確認+BGM再生useEffect追加                                                           | なし    |
| 2026-03-01 | Agent3   | T3-1   | /backend/infrastructure         | DONE   | genai SDK実API化(Imagen/Lyria)+Pub/Sub+graceful降格                                             | なし    |
| 2026-03-01 | Agent3   | T3-2   | /backend/infrastructure         | DONE   | 入力サニタイズ+FIRESTORE_MODE fallback+JSONログ追加                                             | なし    |
| 2026-03-01 | Agent3   | T3-3   | /backend/infrastructure         | DONE   | TTL env化+hit/miss JSONログ+モデル名gemini-3更新                                                | なし    |
| 2026-03-01 | All      | T4-1   | /scripts                        | DONE   | 対戦シナリオ+HP検証+match_logカウント+サマリ出力追加                                            | なし    |
| 2026-03-01 | Agent3   | T4-2   | /docs                           | DONE   | APIレイテンシ+コスト+最適化+structured log一覧                                                  | なし    |
| 2026-03-01 | Agent3   | T4-3   | /docs                           | DONE   | Pre/Deploy/Post 3フェーズチェックリスト作成                                                     | なし    |

## ステータス定義

| Status        | 説明                                  |
| ------------- | ------------------------------------- |
| `TODO`        | 未着手                                |
| `IN_PROGRESS` | 実装中                                |
| `BLOCKED`     | 依存待ち（Blocker欄に必ず理由を記載） |
| `DONE`        | DoD達成済み                           |
