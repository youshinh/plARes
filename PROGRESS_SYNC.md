# PROGRESS_SYNC.md

最終更新: 2026-03-07

## 運用ルール

- 着手時に Status を `IN_PROGRESS` へ
- 完了時（DoDを満たした上で）`DONE` へ
- ブロッカー発生時は Blocker 欄に必ず理由を記載する

| Date       | Owner    | TaskID | Directory                       | Status | NextAction                                                                                      | Blocker |
| ---------- | -------- | ------ | ------------------------------- | ------ | ----------------------------------------------------------------------------------------------- | ------- |
| 2026-03-07 | Codex    | T1-34  | /frontend/src, /backend/ai_core, /backend/tests | DONE   | モバイルMenuの閉時ヒット領域修正、AR進入フローの手動開始化、AR HUD再配置、interaction thought混入除去と tactical interaction 軽量モデル化 | `pytest` 未導入のため backend unit test一括実行は未実施 |
| 2026-03-07 | Codex    | T2-23  | /frontend/src, /backend/ai_core, /backend/tests | DONE   | 顔写真を Gemini Image で 1:1 顔テクスチャへ整形し、`skinUrl` を profile 永続化して再表示でも復元する | なし    |
| 2026-03-07 | Codex    | T1-33  | /frontend/src, /backend/ai_core, /backend/tests, /shared/types | DONE   | Fusion Craft を `skin / attachment` の二系統へ拡張し、mount point選択・装備画像アタッチ・inventory記録・backend helperを追加 | なし    |
| 2026-03-07 | Codex    | T1-32  | /frontend/src                   | DONE   | `useRobotBoneScaling.ts` / `useAttachmentManager.ts` / `headProjectionMaterial.ts` を実装し、骨スケーリング・マウントポイント装備・顔テクスチャの頭部投影を追加 | なし    |
| 2026-03-07 | Codex    | T1-31  | /frontend/src, /backend/ai_core, /shared/types | DONE   | `bodyType` を shared/frontend/backend に通し、6機体の `model_type` に基づく初期ステータス・PBR差・character generation反映を追加 | なし    |
| 2026-03-07 | Codex    | T1-30  | /frontend/src, /shared/types    | DONE   | 機体タイプを `A/B` 固定から `wood/resin/metal × heavy/slim` の6種カタログに拡張し、Battle Prep / FaceScanner を共通リスト selector へ変更 | なし    |
| 2026-03-07 | Codex    | T2-22  | /frontend/src, /backend/ai_core, /shared | DONE   | `battle_coaching` の configured policy を frontend の自動 request に反映し、ADK tactic / backend interaction fallback を主従付きで接続 | なし    |
| 2026-03-07 | Codex    | T2-21  | /frontend/src, /backend/ai_core, /backend/tests | DONE   | `request_battle_state_snapshot` / `request_tactical_recommendation` を追加し、ADK bridge結果を debug UI と tactical panel に反映 | なし    |
| 2026-03-07 | Codex    | T2-20  | /backend/ai_core, /backend/tests | DONE   | `ADKBridge` を追加し、`articulation_agent.py` の tool が battle snapshot / tactical recommendation を返せる形へ更新 | なし    |
| 2026-03-07 | Codex    | T2-19  | /frontend/src, /backend/ai_core, /backend/tests | DONE   | `audio_ws` に `recognized_phrase / expected_phrase` を通し、`AudioJudgeService` が transcript similarity を accuracy に反映するよう改善 | なし    |
| 2026-03-07 | Codex    | T2-18  | /frontend/src, /backend/ai_core | DONE   | 修行の `incantation_submitted` に `expected_phrase / recognized_phrase` を通し、音声判定の第一段を仕様寄せ | なし    |
| 2026-03-07 | Codex    | T2-17  | /frontend/src, /backend/ai_core, /backend/tests, /scripts | DONE | `request_adk_status` 経路とADK可用性表示、Game WS再接続時のlive debug更新、Phase1 smokeへ `test_game_application.py` 追加 | なし    |
| 2026-03-07 | Codex    | T2-16  | /docs, /frontend/src, /scripts  | DONE   | `architecture_live.md` / `release_checklist.md` 改訂、`useLiveRouteSelector` 導入、Phase1 smoke雛形追加 | なし    |
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
| 2026-03-07 | Codex    | T1-21  | /frontend/src, /backend/ai_core | DONE   | 任意locale + Gemini翻訳キャッシュ基盤、FaceScanner多言語化、Fusion Craft状態遷移化、モバイル導線カード追加 | なし    |
| 2026-03-07 | Codex    | T1-22  | /frontend/src                   | DONE   | Hub設定カード追加、後変更用の言語導線整理、recent locale保存、表記を plARes に統一             | なし    |
| 2026-03-07 | Codex    | T1-23  | /frontend/src                   | DONE   | AppMainHudの責務分割（Hub/BattlePrep/ModeFocus/Profile）+ Summon残存文言の多言語化            | なし    |
| 2026-03-07 | Codex    | T1-24  | /frontend/src                   | DONE   | Walk/Training/Match の専用画面コンポーネント追加、PlayMode selector導入でHUD分離を前進        | なし    |
| 2026-03-07 | Codex    | T1-25  | /frontend/src                   | DONE   | Fusion Craft を modal から Walk専用 screen へ昇格し、mobile向けにスクロール可能 panel へ調整  | なし    |
| 2026-03-07 | Codex    | T1-26  | /frontend/src                   | DONE   | `AppOverlayRouter` を追加し、`App.tsx` の entry/main overlay 分岐を router component に整理   | なし    |
| 2026-03-07 | Codex    | T1-27  | /frontend/src, /.playwright-cli | DONE   | overlay props組み立てを hook化し、Playwrightで `English -> Hub -> Walk -> Fusion Craft` 遷移を確認 | backend未起動のためWS完走は未確認 |
| 2026-03-07 | Codex    | T0-5   | /frontend, /backend, /cloudbuild | DONE  | backend起動下で `English -> Hub -> Walk -> Fusion Craft -> Training -> Battle Prep` を再確認し、Cloud Runへ再デプロイ | なし    |
| 2026-03-07 | Codex    | T1-28  | /frontend/src, /.playwright-cli | DONE   | mobile対戦UIを再整理し、`Menu` を `Quick / Settings` 化、`Tactical Options` を mobile下部drawer化して Playwright 390x844 で確認 | なし    |
| 2026-03-07 | Codex    | T1-29  | /frontend/src                   | DONE   | 機体タイプ定義を list-driven 化し、Battle Prep と FaceScanner の描画を定義リスト参照へ変更     | なし    |
| 2026-03-07 | Codex    | T1-30  | /frontend/src, /.playwright-cli | DONE   | 非内蔵locale選択時に言語画面から進めない不具合を修正し、pending translation を main接続後に遅延要求するよう変更。Playwrightで `Français` 選択後に summon へ進むことを確認 | なし    |
| 2026-03-07 | Codex    | T1-35  | /frontend/src, /backend/ai_core, /backend/tests | DONE | manual/CPU `match_end` の勝敗明示化、勝者インタビューのWeb Speech TTS、BGM未取得時のフォールバック音、Flow Hub/MenuのモバイルUI再設計と背景色差分・アニメーション修正 | pytest未導入のため自動実行不可 |

## ステータス定義

| Status        | 説明                                  |
| ------------- | ------------------------------------- |
| `TODO`        | 未着手                                |
| `IN_PROGRESS` | 実装中                                |
| `BLOCKED`     | 依存待ち（Blocker欄に必ず理由を記載） |
| `DONE`        | DoD達成済み                           |
