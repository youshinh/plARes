### エージェント1：フロントエンド＆XRエージェント (The Edge)

**役割**: スマホブラウザでの描画、AR空間認識、およびローカル演算による自律移動（反射神経）の実装。
**担当ディレクトリ**: `/frontend/`

#### 必要な技能・知識 (Skills)

- **React & 状態管理 (Server-Driven UI)**
  - バックエンドからWebSocket経由で受信する言語非依存のJSONデータ（戦術パネルの選択肢など）をReactのStateにバインドし、UIコンポーネントを動的にレンダリングする（Server-Driven UI）実装スキル。
- **Three.js & WebGL高度描画**
  - glTF形式の3Dモデルのレンダリング、カスタムシェーダーを用いたマテリアルの動的書き換え（戦歴テクスチャの反映や材質進化）、およびレベルアップに伴う特定のボーン（骨格）のスケール値（`bone.scale.set(x, y, z)`）の動的乗算スキル。
  - 必殺技発動時のパーティクルエフェクトなどの描画コマンドの発行スキル。
- **WebXR Device API (空間認識パイプライン)**
  - `Hit Test API` と `Depth Sensing API` を併用し、カメラ映像から現実空間の床や段差、自作の木工作品をリアルタイムに3Dメッシュ化する処理。
  - 深度情報（`XRDepthInformation`）を利用し、現実の段差が3Dモデルよりも手前にある場合に描画をクリッピングする「オクルージョン（隠蔽）表現」の実装スキル。
- **NavMesh動的生成と経路探索 (Pathfinding)**
  - 取得した空間の頂点データから移動可能エリア（NavMesh）を動的生成し、`recast-wasm` や `three-pathfinding` 等のライブラリ（または独自のローカル演算）を用いて、障害物を迂回する最短ルートを毎フレーム計算するアルゴリズム実装スキル。
- **Web Speech API & レイテンシ・ハイディング**
  - OS標準の音声認識（Web Speech API）を用いて遅延ゼロでプレイヤーの音声をテキスト化し、機体の移動ベクトル（物理インパルス）に即時反映させるスキル。
  - 必殺技発動時に通信ラグを隠蔽するため、APIからのJSON返答を待たずに3秒間の「チャージアニメーション」を即座に開始させる非同期アニメーション制御スキル。
- **3層優先度制御ステートマシン (FSM)**
  - `requestAnimationFrame` のレンダリングループ内に、Priority 1（音声検知の緊急回避）、Priority 2（AIからのJSONコマンド割り込み）、Priority 3（ローカルNavMesh基本移動）の順序で状態を上書き・評価するFSMの構築スキル。

---

### エージェント2：バックエンドAI・ストリーミングエージェント (The Brain)

**役割**: Gemini 3.1 Proを用いた双方向同時ストリーミング（Bidi-streaming）、高度な推論、滑舌判定、マクロ戦術の立案。
**担当ディレクトリ**: `/backend/ai_core/`

#### 必要な技能・知識 (Skills)

- **Python 非同期プログラミング (Non-Blocking Control)**
  - `asyncio` を深く理解し、`asyncio.gather()` 等を用いてデータの受信（上り）とAIからの送信（下り）タスクを同時に走らせる並行タスク制御のスキル。AIが重い音声合成を返している最中でも入力キューをブロックさせず、ユーザーの「割り込み（Interruption）」を処理する知識。
- **Agent Development Kit (ADK) / Antigravity 統合**
  - セッションごとに `SessionService` と、スレッドセーフな非同期FIFOバッファである `LiveRequestQueue` を生成・管理するスキル。
  - `runner.run_live()` などの非同期ジェネレータを用いたイベント処理の実装。
- **Gemini Multimodal Live API (Bidi-streaming) 操作**
  - スマホカメラから毎秒1〜2fpsのフレーム映像と、音声データを継続的にストリーミングし、AIに「現実の部屋の状況」や「ジェスチャー」をリアルタイム監視させるストリームパイプラインの構築スキル。
- **Native Audio解析と滑舌判定ロジック**
  - 音声をテキスト化（STT）せず、16kHz PCM等の「生の音声波形（Native Audio）」のままGeminiモデルに直接入力する処理。
  - 波形から「正確さ」「スピード」「気迫（声の大きさや震え）」の3軸を直接解釈させ、クリティカル判定のスコア（0.0〜1.0）をJSONとして出力させるシステムプロンプトの設計スキル。
- **高度なプロンプトエンジニアリング (Tone Control)**
  - システムプロンプトに変数をバインドし、機体の性格（`tone`）やトーク力（`talkSkill`）を制御するスキル。また、説教臭さを防ぐため「15文字以内の1文に収める」などの厳格なFew-shot制約（Tone Control）を実装する知識。
- **JSON Function Calling生成**
  - 映像や音声の文脈から戦況を判断し、`{"action": "take_cover", "target_object": "obstacle_A"}` といった言語非依存のマクロ戦術コマンドをダウンストリーム出力するスキル。

---

### エージェント3：データ・通信網＆拡張生成AIエージェント (The Nervous & Data System)

**役割**: 超低遅延ネットワークの構築、Firestoreデータモデリング、MCP統合、および画像・動画生成APIのバッチ処理。
**担当ディレクトリ**: `/backend/infrastructure/` & `/shared/`

#### 必要な技能・知識 (Skills)

- **リアルタイム通信プロトコルの実装分離**
  - **WebRTC Data Channel**: プレイヤー間の座標や移動ベクトルをラグ10〜30msでP2P同期させるためのUDPベースの通信実装スキル。
  - **WebRTC Media Stream**: PipecatやDaily等のOSSを活用し、マイク音声（Base64エンコード）とカメラ映像をバックエンドに安定して流し込むストリーム構築スキル。
  - **WebSocket**: AIのFunction Calling結果やバフ・デバフのJSONデータをミリ秒単位でパブリッシュ（同期）する知識。
- **シグナリングサーバーとマッチング基盤**
  - Firebase Realtime Database や Firestore を用いた、WebRTC接続のためのIPアドレス/ポート交換（シグナリング）および、QR/URLベースの即席マッチングルーターの実装スキル。
- **NoSQLデータモデリングとインメモリ状態管理**
  - Firestoreにおいて、`users/{userId}/robots/{robotId}` のようなサブコレクション階層を用いた正規化スキーマの設計スキル。
  - APIコスト破綻を防ぐため、試合中の高頻度なRead/WriteはADKのローカルメモリやRedis等で保持（State Management）し、試合終了時に要約ログ（`aiMemorySummary`）として1度だけFirestoreをUpdate（マージ）するアーキテクチャの構築スキル。
- **MCP (Model Context Protocol) 統合**
  - 「Managed MCP servers for Firestore」をインフラに導入し、開発者がAPIを書かずとも、AI自身にデータベースのクエリ実行権限（ツール）を付与し、自律的に過去の履歴（`matchLogs`）を検索させるインフラ構成スキル。
- **Vertex AI Context Caching**
  - システム起動時に、膨大な「戦歴」や物理ルールのプロンプトを一度だけキャッシュ領域にロードし、初動トークン生成（TTFT）を爆速化させるAPI操作スキル。
- **マルチモーダル生成AIパイプライン (ダイナミック・ゲーティング)**
  - Nano Banana Pro (Gemini 2.5 Flash Image) の「8-Image Mix（画像融合）」APIを利用し、観客から送られた現実の写真とテキストを融合させ、1〜2秒で3Dテクスチャを生成・保存するバッチ処理。
  - Firestoreの試合カウンター（例：5試合ごと）を監視（Pub/Subトリガー等）し、Veo 3.1 APIやLyria APIを用いてハイライト動画・音楽を非同期生成するイベント駆動型バッチパイプラインの実装スキル。

---

これらのスキル要件（Skills）を各エージェントのプロンプト（インストラクション）に組み込むことで、それぞれのAIエージェントが「どの技術仕様に基づいてコードを出力すべきか」を正確に理解し、高度に専門化されたコードを自律的に生成・実装することが可能になります。

# PlaresAR Skills & Implementation Requirements

## 1. フロントエンド・XR領域 (エージェント1)

- **SKILL_Frontend_01: Server-Driven UI Implementation**
  - WebSocket経由の非依存JSON（機能やパネル情報等）を解釈し、React Stateを用いて自律的にUI描画する能力。
- **SKILL_Frontend_02: Advanced WebGL & Three.js**
  - glTFレンダリング、カスタムシェーダーによるマテリアル操作、特定骨格（bone）のスケール乗算制御、エフェクト/パーティクルの軽量描画スキル。
- **SKILL_Frontend_03: Spatial Computing & WebXR**
  - Hit Test / Depth Sensing APIを用いたリアルタイムメッシュ化と、空間オクルージョン（現実に隠れる等）の描画制御知識。
- **SKILL_Frontend_04: Rapid FSM & Local Pathfinding**
  - `requestAnimationFrame` 環境下の3層システム割り込み(FSM)制御、およびクライアントサイドNavMesh生成・経路探索アルゴリズム実装。
- **SKILL_Frontend_05: Latency-Hiding UX**
  - 音声認識のローカル処理による低遅延インパルスへの直接変換、および「モーション先行グラフィック」を用いた通信遅延の知覚隠蔽。

## 2. バックエンドAI領域 (エージェント2)

- **SKILL_AI_01: Non-Blocking Subroutine & Python Asyncio**
  - `asyncio.gather` やスレッドセーフバッファを用いて、重篤な推論モデルAPI通信に際してシステムをブロックさせないアーキテクチャ設計スキル。
- **SKILL_AI_02: Multimodal Live API Operator**
  - Gemini等に対し、安定して1-2fpsの映像と16kHzのPCM音声波形を流し込み、ストリーミングでデータを拾い上げる統合通信スキル。
- **SKILL_AI_03: Native Audio Semantic Analysis**
  - 音声をテキスト化せず波形単体から「気迫・スピード・正確さ」の要素をメタ情報として推論・採点させるプロンプト工学。
- **SKILL_AI_04: Dynamic Prompting & JSON Function Calling**
  - 機体のPersonality Variablesを変数として埋め込むTone Control技術と、言語非依存マクロ戦術（移動、バフ等）を確実にJSONスキーマで並行印字させる技術。

## 3. インフラ・データ通信網・拡張領域 (エージェント3)

- **SKILL_Infra_01: Ultra-Low Latency Protocol Segregation**
  - WebRTC Data Channel（10-30ms狙いUDP）、Media Stream（メディアパイプ）、WebSocket（イベント同期）を適材適所で分割・管理するリアルタイム通信知識。
- **SKILL_Infra_02: Resource-Optimized NoSQL Modeling**
  - FirestoreにおけるWrite/Read課金最適化。インメモリ・Redis等を用いたState Managementと、コミットベースのUpdate実装。
- **SKILL_Infra_03: Model Context Protocol (MCP) Setup**
  - AIに対し自律的なデータベースクエリ発行や外部API操作といったシステム権限を、動的な関数リストとして連携・設定するインフラ構築技術。
- **SKILL_Infra_04: Context Caching for Speed**
  - 初期コンテキスト（過去履歴・物理法則等）ロードをキャッシュ機能を用いて最適化し、初動AI応答時間を短縮（TTFT削減）する知識。
- **SKILL_Infra_05: Asynchronous Gating Pipeline**
  - 特殊イベント駆動に基づき、コスト・時間がかかる重い画像合成生成や動画抽出APIをバッチパイプラインとしてUIをブロックせずに実行する知識。
