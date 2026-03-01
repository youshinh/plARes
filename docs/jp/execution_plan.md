# 15.plARes：開発実行計画（タスク分解）

[English Version (EN)](../execution_plan.md)

最終更新日: 2026-03-01（全コード精読・デッドコード削除後に更新）
対象期間: 2026-03-02 〜 2026-04-10（6週間）

## 1. 目的

`Engineering_Living_WebAR_AI.pdf` と現状実装の差分を埋め、
「デモ品質」から「継続運用できる開発品質」へ移行する。

- 重点1: コア体験（WebXR/FSM/低遅延同期）の完成度向上
- 重点2: モック実装の本実装化（生成AI・パイプライン）
- 重点3: 開発運用ルール（`PROGRESS_SYNC.md`、テスト、CI）の定着

---

## 2. 実行ルール（全タスク共通）

- ディレクトリ責務を厳守する
  - Agent 1: `/frontend`
  - Agent 2: `/backend/ai_core`
  - Agent 3: `/backend/infrastructure` と `/shared`
- Contract-First: 先に `/shared/types` の型を更新してから実装
- 進捗同期: `PROGRESS_SYNC.md` を必ず更新して着手/完了を記録
- 完了条件（DoD）を満たすまで「完了」にしない

---

## 3. 現状実態サマリ（2026-03-01 全コード精読結果）

| タスクID | 内容                           | 実態                                                                                                                                                                                                                                            |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0-1     | PROGRESS_SYNC.md 作成          | **未作成**                                                                                                                                                                                                                                      |
| T0-2     | bidi_session テストハング修正  | **誤認**: コードはADK Runner方式に既移行。問題はテストの `import get_plares_agent from bidi_session`（関数が存在しない）による `ImportError`                                                                                                    |
| T0-3     | CI最低限固定化                 | **不足**: `.github/workflows/quality-gate.yml` はフロントビルドのみ。Backendテスト・py_compileなし                                                                                                                                              |
| T1-1     | Depth情報のprops配線           | **半完成**: `useWebXRScanner` は `depthTexture`/`depthRawToMeters` を返却済み。`MainScene` が `RemoteRobotCharacter` へ渡していない                                                                                                             |
| T1-2     | シェーダーパッチ実適用         | `RemoteRobotCharacter` に `depthTexture` が届いていないためブロック中                                                                                                                                                                           |
| T2-1     | Live経路の一本化               | **未整理**: フロント直結（`GeminiLiveService` + Ephemeral Token）とバックエンド中継（ADK Runner `/ws/live`）が並存。本番経路が未定義                                                                                                            |
| T3-1     | multimodal_pipeline モック脱却 | **100%モック**: `generate_fused_item` は `asyncio.sleep`、Pub/Subも未接続。`google-cloud-pubsub` も `requirements.txt` に未記載                                                                                                                 |
| T3-3     | Context Cache運用改善          | **API実装済み**: `VertexContextCache.load_historical_context` は実API呼び出し。ただしヒット率計測なし                                                                                                                                           |
| **T3-4** | infrastructure未統合実装の削除 | **✅ 完了（2026-03-01）**: `bidi_stream.py`（`google_adk`パッケージ不在で動作不能）/ `state_manager.py`（モックAI・ガード無し）/ `models.py`（上記からのみ参照）/ `verify_multimedia.py` / `verify_winner_interview.py` の計5ファイルを削除済み |
| T4-1     | E2Eスクリプト整備              | **スクリプト存在**: `scripts/e2e_live_smoke.sh` はあるが対戦イベント確認は未追加                                                                                                                                                                |

### 新規発見（今回の精読で追加）

| 新タスクID | 内容                          | 実態                                                                                                                                          |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| T2-4       | 勝者インタビュー・BGM受信処理 | `main.py` が `winner_interview` / `bgm_ready` イベントを送信するがフロント側の受信ハンドラが未実装。BGM URLは現在ハードコードプレースホルダー |
| T3-5       | requirements.txt の依存整理   | `google-cloud-pubsub` 未記載（T3-1実装に必須）。`google-adk` も現在 `/ws/live` で実運用されていないか確認が必要                               |

---

## 4. フェーズ計画（実態反映版）

---

### Phase 0（W1前半）: 開発基盤の是正

#### T0-1: PROGRESS_SYNC.md 作成と運用開始【最優先】

- 担当: Agent 3
- 対象: `/PROGRESS_SYNC.md`（新規作成）
- 実施内容:
  1. リポジトリ直下に `PROGRESS_SYNC.md` を新規作成
  2. テーブル形式: `| Date | Owner | TaskID | Directory | Status | NextAction | Blocker |`
  3. 本計画の全タスクを初期登録（Status=TODO）
- DoD:
  - ファイルが `git ls-files` に含まれる
  - 全タスクが1行以上登録されている

---

#### T0-2: バックエンドテストの ImportError 修正

- 担当: Agent 2
- 対象: `/backend/tests/test_streaming.py`, `/backend/ai_core/streaming/bidi_session.py`
- 背景: `test_streaming.py` が `bidi_session` から `get_plares_agent` をインポートしているが、
  関数が `ai_core/agents/articulation_agent.py` に定義されており `bidi_session.py` には存在しない。
  現在 `pytest` 実行時に `ImportError` または `AttributeError` で即死する。
- 実施内容:
  1. `test_streaming.py` の import を `from ai_core.agents.articulation_agent import get_plares_agent` に修正
  2. `test_articulation_agent_setup` を `agents/articulation_agent.py` の実際のフィールドに合わせてアサーションを修正
  3. `test_handle_client_connection` が `asyncio.wait_for(..., timeout=3.0)` で安定通過することを確認
- コマンド（ローカル確認）:
  ```
  PYTHONPATH=backend backend/venv/bin/python -m pytest backend/tests -q
  ```
- DoD:
  - 上記コマンドがハングせず `3 passed` で完了
  - `ImportError` が発生しない

---

#### T0-3: CI拡充（Backend テスト・py_compile 追加）

- 担当: Agent 3
- 対象: `.github/workflows/quality-gate.yml`（既存に追加）または新規ファイル `.github/workflows/backend-ci.yml`
- 背景: 現在のCIはFrontend buildのみ。Pythonコード品質チェックが全くない。
- 実施内容:
  1. Python 3.11 セットアップ + `pip install -r backend/requirements.txt`
  2. `python -m py_compile backend/ai_core/main.py backend/ai_core/streaming/bidi_session.py backend/infrastructure/*.py`
  3. `PYTHONPATH=backend python -m pytest backend/tests -q --timeout=10`
- DoD:
  - PRでbackend-CI jobが自動実行される
  - テスト失敗時にログでどのテストが落ちたか追える

---

### Phase 1（W1後半〜W2）: Frontend体験完成度の引き上げ

#### T1-1: Depth Occlusion props配線（`MainScene` → `RemoteRobotCharacter`）

- 担当: Agent 1
- 対象: `/frontend/src/App.tsx`（`MainScene` コンポーネント）, `/frontend/src/components/RemoteRobotCharacter.tsx`
- 背景: `useWebXRScanner()` は既に `depthTexture: THREE.DataTexture | null` と
  `depthRawToMeters: number` を返却している（実装済み）。
  しかし `MainScene` での呼び出しが `const { hoverMatrix } = useWebXRScanner()` のみで、
  depth情報が `RemoteRobotCharacter` に渡っていない。
- 実施内容:
  1. `MainScene` で `const { hoverMatrix, depthTexture, depthRawToMeters } = useWebXRScanner()` に変更
  2. `<RemoteRobotCharacter depthTexture={depthTexture} depthRawToMeters={depthRawToMeters} />` にprops追加
  3. `RemoteRobotCharacter` の props型定義に `depthTexture?: THREE.DataTexture | null; depthRawToMeters?: number` を追加
- DoD:
  - TypeScriptコンパイルエラーなし（`npm run build` 成功）
  - `RemoteRobotCharacter` がpropsを受け取るログが確認できる（`console.log` を一時追加して検証）

---

#### T1-2: Depth Shader実適用（`RemoteRobotCharacter` 内部）

- 担当: Agent 1
- 対象: `/frontend/src/components/RemoteRobotCharacter.tsx`, `/frontend/src/utils/depthOcclusion.ts`
- 前提: T1-1完了後
- 実施内容:
  1. `depthOcclusion.ts` の `patchDepthOcclusionMaterial(material, depthTexture, depthRawToMeters)` を
     モデルロード後のmesh traversal内で呼び出す
  2. occlusionMaterialsのrefを保持し `useFrame` 内で `updateDepthOcclusionUniforms` を毎フレーム呼ぶ
  3. アンマウント時に `material.dispose()` を確実に呼ぶ（リーク防止）
  4. `depthTexture === null` の場合はパッチをスキップ（非対応端末フォールバック）
- DoD:
  - AR対応端末（Android/ARCore）でロボットが遮蔽物の後ろに隠れる
  - 非対応端末でエラーなく動作する
  - Chrome DevTools Memory profilerでdetached textureが増殖しない

---

#### T1-3: FSM行動デバッグパネル強化

- 担当: Agent 1
- 対象: `/frontend/src/components/ui/AnimationDebugPanel.tsx`
- 背景: パネルは既に存在するが、P1/P2/P3の優先度出所とトランジションログが未表示。
- 実施内容:
  1. `useFSMStore` から現在の `state`, `priority source` (P1/P2/P3) を参照してパネルに表示
  2. 状態遷移の直近10件をリングバッファで保持・表示（`[timestamp] OLD→NEW (source)` 形式）
  3. `VITE_ENABLE_DEBUG_UI=true` の時のみ表示（既存条件を踏襲）
- DoD:
  - デバッグUIで緊急回避がAI命令を上書きする様子を確認できる
  - パネル非表示時のパフォーマンス影響ゼロ

---

#### T1-4: AR平面未検出ガイド強化

- 担当: Agent 1
- 対象: `/frontend/src/hooks/useWebXRScanner.ts`, `/frontend/src/components/ui/DynamicSubtitle.tsx`
- 背景: 現在は `hitTest not supported` の場合に1度表示するのみで状態変化に追従しない。
- 実施内容:
  1. `useWebXRScanner` の返却値に `scanState: 'idle' | 'scanning' | 'surface_found' | 'unsupported'` を追加
  2. `App.tsx` から `scanState` を受け取り、`DynamicSubtitle` に適切な文言を状態別に表示
     - `scanning`: 「床を映してください（カメラを左右にゆっくり動かす）」
     - `surface_found`: 「タップして戦闘エリアを設置」
     - `unsupported`: 「このデバイスはAR未対応です。3Dプレビューモードで動作します」
- DoD:
  - 初回ユーザーが操作で迷わない（手順を別途文書化）
  - `unsupported` 状態でもアプリがクラッシュしない

---

### Phase 2（W3）: AI Core安定化

#### T2-1: Live接続経路の一本化と明文化

- 担当: Agent 2
- 対象: `/backend/ai_core/main.py`, `/backend/ai_core/streaming/bidi_session.py`, `/frontend/src/services/GeminiLiveService.ts`, `README.md` or `/docs/architecture_live.md`
- 背景: 現在2つのLiveパスが並存している:
  - **パスA（フロント直結）**: `GeminiLiveService.ts` がEphemeral Token経由で `google.genai` SDK直接接続
  - **パスB（バックエンド中継）**: `/ws/live` WebSocket → ADK Runner `bidi_session.py` → Gemini
  - どちらが本番用か不定義で、開発者が混乱する状態
- 実施内容:
  1. 採用するパスを技術的に決定（推奨: パスA＝フロント直結（低遅延・シンプル）を本番に、パスB＝ADKエージェント機能（ツール呼び出し等）が必要な場合の別チャネルとして残す）
  2. 決定内容を `/docs/architecture_live.md` に記述（図解推奨）
  3. 非採用側（または補助的位置づけ）のコードに `// TODO: [architecture_live.md参照] 補助チャネル` コメントを追加
  4. `README.md` に接続フロー図または説明を追加
- DoD:
  - 新規開発者がどちらのパスを使うべきか5分以内に判断できるドキュメントが存在する
  - 本番経路のコードが1本に絞られている

---

#### T2-2: 音声判定ロジックのチューニングと計測追加

- 担当: Agent 2
- 対象: `/backend/ai_core/main.py`（`critical_threshold`, `sync_bonus` 付近のロジック）
- 実施内容:
  1. 現在のデフォルト値を確認し、チューニング候補パラメータをenv変数化（`PLARES_CRITICAL_THRESHOLD`, `PLARES_SYNC_BONUS`）
  2. 判定結果（`critical` / `miss` / `normal`）をstructured logで出力（`{"event":"voice_judge","result":"critical","threshold":0.7,"score":0.82}`）
  3. 最低3パターンの音声ケースでローカル手動検証・ログ確認
- DoD:
  - ログが構造化JSON形式で出力される
  - env変数でパラメータを変更できる
  - 誤判定率が手動テストで主観的に改善されている

---

#### T2-3: キャラクター生成API失敗時の動線改善

- 担当: Agent 2
- 対象: `/backend/ai_core/character_generator.py`, `/frontend/src/hooks/useCharacterSetup.ts`
- 実施内容:
  1. `character_generator.py` の失敗時レスポンスに `error_code` フィールドを追加
     （例: `"error_code": "gemini_quota_exceeded"` / `"model_unavailable"` / `"invalid_input"`）
  2. `useCharacterSetup.ts` でエラーコードに応じた日本語メッセージを表示
  3. 「再試行」ボタンのUI追加（`isGenerating` 状態利用）
- DoD:
  - 生成失敗時に「再試行」ボタンが表示される
  - エラーコードがフロントのログ・UIに反映される

---

### Phase 3（W4〜W5）: Infrastructure本実装化

#### T3-1: multimodal_pipeline.py のモック脱却

- 担当: Agent 3
- 対象: `/backend/infrastructure/multimodal_pipeline.py`
- 背景: `generate_fused_item` は `asyncio.sleep(1)` + ハードコードURLのみ。`MilestoneVideoGenerator` も Pub/Sub未接続。
- 【MCP確認済み】使用API:
  - **画像生成**: `google.genai` クライアント経由で `gemini-3.1-flash-image-preview` を使用
    - `response = await asyncio.to_thread(client.models.generate_images, model='gemini-3.1-flash-image-preview', prompt=prompt, config=types.GenerateImagesConfig(number_of_images=1))`
    - レスポンスは `response.generated_images[0].image.image_bytes` でバイト列として取得
  - **動画生成 (Veo)**: モデル名は `veo-3.1-generate-001`（long-running operation の非同期ポーリングが必要）
  - **Pub/Sub**: `google-cloud-pubsub` の `pubsub_v1.PublisherClient()` を使用（現在コメントアウト中 → `requirements.txt` に `google-cloud-pubsub` が必要）
- 実施内容:
  1. **RealityFusionCrafter**: `asyncio.sleep` を削除し、Imagen API を実呼び出し
     - `client = genai.Client()` を使用（`vertex_cache.py` と同じパターン）
     - 生成した画像バイトをGCS（`google-cloud-storage`）にアップロードし公開URLを返す
     - または `data:image/png;base64,...` 形式でインライン返却も可（フロント実装に合わせる）
  2. **MilestoneVideoGenerator**: `pubsub_v1.PublisherClient()` のコメントアウトを解除
     - プロジェクトIDは `os.getenv('GOOGLE_CLOUD_PROJECT')` から取得
     - `requirements.txt` に `google-cloud-pubsub>=2.21.0` を追加
  3. API失敗時のリトライ（最大3回、指数バックオフ: 1s→2s→4s）とエラーログ追加
- DoD:
  - `generate_fused_item` 呼び出しでモックURLではなく実URL（GCS or data URI）が返る
  - Pub/Subメッセージが実際にenqueueされる（Cloud Consoleの「Pub/Sub > トピック > メッセージ」で確認）
  - 失敗時も3回リトライ後にエラーを上位に伝播

---

#### T3-2: MCP Tool呼び出しの実行系検証

- 担当: Agent 3
- 対象: `/backend/infrastructure/mcp_server.py`, `/backend/ai_core/main.py`
- 実施内容:
  1. `mcp_server.py` のFirestore検索ツールが実際にクエリを実行し結果を返すことをローカルで検証
  2. ADK Agentのツール呼び出しフローで `mcp_server` 経由の検索結果がAI応答に含まれることを確認
  3. 検証手順をスクリプト or ドキュメントに記録
- DoD:
  - 過去対戦ログを参照したAI応答が再現できる（ローカル検証スクリプトで確認）

---

#### T3-3: Context Cache ヒット率計測追加

- 担当: Agent 3
- 対象: `/backend/infrastructure/vertex_cache.py`, `/backend/ai_core/main.py`
- 背景: `VertexContextCache.load_historical_context` は実API呼び出し済み（`google.genai client.caches.create`）。計測が不足。
- 【MCP確認済み】- Context Cache対応モデル:
  - **Vertex AI経由使用可能モデル**: `gemini-3-flash-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`, `gemini-2.5-flash-preview-tts`, `gemini-3.1-flash-image-preview`
  - `PLARES_INTERACTIONS_MODEL` env変数の値が `gemini-3-flash-preview` 形式になっているか確認が必要
- 実施内容:
  1. `get_cache_for_user` 呼び出し時に `hit` / `miss` をstructured JSON形式でログ出力
     - `{"event": "context_cache", "result": "hit", "user_id": "...", "cache_id": "..."}`
  2. キャッシュ作成失敗時のエラーログに `user_id` と失敗理由を含める
  3. ユーザー別TTLをenv変数 `PLARES_CACHE_TTL_SECONDS`（デフォルト3600）で設定変更可能にする
  4. `PLARES_INTERACTIONS_MODEL` のデフォルト値を `gemini-3-flash-preview` に更新し、READMEにバージョン番号必須の旨を明記
- DoD:
  - ログでキャッシュヒット率がモニタリング可能
  - 再接続時のTTFT改善が開発者ログで観測できる
  - モデル名バージョン指定の要件がドキュメント化されている

---

#### T3-4: ✅ infrastructure/ デッドコード削除（2026-03-01 完了）

- 担当: Agent 3
- **削除済みファイル** (5ファイル):
  - `bidi_stream.py` — `google_adk`（存在しないパッケージ）をインポートしており動作不能
  - `state_manager.py` — AIサマリがハードコード文字列・firebase_adminのガードなし・`main.py`から未参照
  - `models.py` — 上記2ファイルからのみ参照（`main.py`はすべてplain dict使用）
  - `verify_multimedia.py` — 孤立スクリプト、用途不明
  - `verify_winner_interview.py` — 孤立スクリプト、用途不明
- **残存するinstrastructure/ファイル** (全て`main.py`から参照あり):
  - `multimodal_pipeline.py` (T3-1対象), `vertex_cache.py` (T3-3対象), `mcp_server.py` (T3-2対象)

---

#### T3-5: requirements.txt 依存パッケージ整理

- 担当: Agent 3
- 対象: `/backend/requirements.txt`
- 背景: `multimodal_pipeline.py`のPub/Sub実装（T3-1）に`google-cloud-pubsub`が必要だが記載なし。`requirements.txt`は現在8行。
- 実施内容:
  1. `google-cloud-pubsub>=2.21.0` を追記（T3-1実装前提）
  2. `google-cloud-storage>=2.16.0` を追記（Imagen画像のGCSアップロード前提）
  3. `google-adk` が必要かを `/ws/live` ルートの実運用状況（T2-1決定後）を踏まえて判断し、不要なら明記
  4. `pydantic>=2.0` は `main.py` でほぼ未使用（plain dict）だが `bidi_session.py`ではまだ使用 → 念のため維持
- DoD:
  - `pip install -r backend/requirements.txt` が新規環境で完走する
  - T3-1実装後のローカル動作確認ができる

---

### Phase 2.5（W3後半）: フロントエンド・バックエンド連携の穴埋め

#### T2-4: 勝者インタビュー・BGM受信ハンドラ実装

- 担当: Agent 1+2
- 対象: `/frontend/src/App.tsx`（WebSocketイベントハンドラ）, `/backend/ai_core/main.py`（`_emit_victory_bgm`）
- 背景: `main.py` は試合終了後 `winner_interview` と `bgm_ready` イベントを送信しているが、
  - フロント側（`App.tsx`）に `winner_interview` / `bgm_ready` イベントのハンドラが存在しない
  - `bgm_ready.url` は現在 `https://praresar.storage/audio/victory_...mp3`（ハードコードプレースホルダー）
- 実施内容:
  1. **Agent 1**: `App.tsx` の `handleRemoteBattleEvent` に `winner_interview` / `bgm_ready` ケースを追加
     - `winner_interview`: `DynamicSubtitle` または専用モーダルに `payload.text` を表示
     - `bgm_ready`: `<audio>` 要素または WebAudio でURLを再生（Autoplay Policy考慮）
  2. **Agent 2**: `_emit_victory_bgm` の URL生成を `milestone_generator.trigger_victory_music()` の戻り値（T3-1実装後）に差し替え
     - T3-1が未完了の場合は URL を `null` で送信し、フロントがnullハンドリングする
- DoD:
  - 試合終了後に勝者ロボットの台詞がUIに表示される
  - BGMは再生失敗してもコンソールに警告ログが出るだけでクラッシュしない

---

### Phase 4（W6）: 結合検証とリリース準備

#### T4-1: E2Eシナリオ拡張

- 担当: Agent 1+2+3
- 対象: `/scripts/e2e_live_smoke.sh`
- 背景: スクリプトは存在するが対戦イベント確認が未追加。
- 実施内容:
  1. 既存「Token発行→Live接続」フローの後に以下を追加:
     - `critical_hit` イベント送信とレスポンス確認
     - `match_end` イベント後の `winner_interview` レスポンス確認
  2. 各ステップに `echo "[STEP] ..."` でログを入れ、失敗時に `exit 1` する
- DoD:
  - `bash scripts/e2e_live_smoke.sh` 1コマンドで主要導線を自動検証できる
  - CI（または手動）で定期実行できるドキュメントがある

---

#### T4-2: 性能・コスト基準チェック

- 担当: Agent 3
- 指標:
  - WebRTC座標同期: 10〜30ms目標（Wireshark or Chrome devtools）
  - 音声判定レスポンス: 3秒詠唱内で収束
  - Firestore書き込み: 試合中 < 1回/秒（高頻度書き込み禁止）
- 実施内容:
  1. ローカル2端末で実測し、結果を `/docs/perf_report_YYYYMMDD.md` に記録
  2. 基準を超えた場合の対処（バッチ書き込み切り替え等）を検討・実装
- DoD:
  - 実測レポートが1ファイルで提出される
  - 全指標が基準値内

---

#### T4-3: リリースチェックリスト作成

- 担当: Agent 3
- 対象: `/docs/release_checklist.md`（新規作成）
- 実施内容:
  1. 環境変数一覧（`GOOGLE_CLOUD_PROJECT`, `PLARES_*`等）と設定値の確認手順
  2. APIキー・サービスアカウント権限チェックリスト
  3. Cloud Run デプロイ手順（`cloudbuild.yaml` ベース）
  4. 監視項目（Cloud Logging クエリ例）
  5. ロールバック手順（`gcloud run services update-traffic`）
- DoD:
  - 新規メンバーでも手順通りにデプロイ可能なドキュメント

---

## 5. 優先バックログ（直近10営業日）

| 優先度 | タスクID | 内容                                   | 担当    | 工数目安 |
| :----: | -------- | -------------------------------------- | ------- | -------- |
|   ✅   | T3-4     | デッドコード削除（完了済み）           | -       | -        |
|  🔴 1  | T0-1     | `PROGRESS_SYNC.md` 作成                | Agent 3 | 0.5h     |
|  🔴 2  | T0-2     | テスト ImportError修正                 | Agent 2 | 1h       |
|  🔴 3  | T3-5     | requirements.txt 依存追加              | Agent 3 | 0.5h     |
|  🔴 4  | T0-3     | CI Backend job追加                     | Agent 3 | 1h       |
|  🟠 5  | T1-1     | Depth props配線（`MainScene`修正のみ） | Agent 1 | 1h       |
|  🟠 6  | T1-2     | Depth shader実適用                     | Agent 1 | 2h       |
|  🟡 7  | T2-1     | Live経路一本化・ドキュメント           | Agent 2 | 2h       |
|  🟡 8  | T2-4     | 勝者インタビュー・BGM受信ハンドラ      | Agent 1 | 2h       |
|  🟢 9  | T3-1     | multimodal_pipeline本実装着手          | Agent 3 | 4h       |

---

## 6. タスク管理テンプレート（`PROGRESS_SYNC.md` 用）

```md
| Date       | Owner  | TaskID | Directory      | Status      | NextAction             | Blocker |
| ---------- | ------ | ------ | -------------- | ----------- | ---------------------- | ------- |
| 2026-03-02 | Agent2 | T0-2   | /backend/tests | IN_PROGRESS | import修正後pytest確認 | なし    |
```

ステータス定義:

- `TODO`: 未着手
- `IN_PROGRESS`: 実装中
- `BLOCKED`: 依存待ち（Blockerに理由を必ず記載）
- `DONE`: DoD達成済み・レビュー完了

---

## 7. 完了判定

以下を満たした時点で本計画を完了とする。

- P0〜P4の全タスクが `DONE`
- モック扱いだった主要機能（RealityFusion/Video/Music）が本実装済み
- E2E + 単体テストがCIで安定通過
- `PROGRESS_SYNC.md` が継続運用されている（最終更新から7日以内）
