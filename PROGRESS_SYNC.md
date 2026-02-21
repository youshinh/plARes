# PlaresAR: Agent Progress Sync

本ファイルは3つのエージェント（Agent 1, Agent 2, Agent 3）間の非同期の進捗共有およびインターフェース合意のためのドキュメントです。
タスク完了時やAPI変更時には必ずここを更新し、次作業の開始時に現状を読み取ってください。

## 🔹 Current Status (全体状況)

- **Phase**: Backend AI Core Complete
- **Blockers**: None

## 🔹 Agent 1: Frontend & XR (`/frontend/`)

- [x] プロジェクト初期化 (React, Three.js等) [DONE]
- [x] WebXR空間認識モジュールの初期設計・モックアップ [DONE – real per-frame hit-test + depth DataTexture]
- [x] 3層FSMと通信レイテンシ隠蔽の実装 [DONE – real AudioContext PCM stream + WS FSM]

## 🔹 Agent 2: Backend AI (`/backend/ai_core/`)

- [x] Python ADK非同期ストリーミングの初期設定 [DONE – InMemorySessionService + LiveRequestQueue実装]
- [x] Native Audio/Multimodal Bidi-streamingパイプ構築 [DONE – bidi_session.py でLlmAgent.run_live()使用]
- [x] 滑舌判定プロンプトとFunction Callingのシステム定義 [DONE – FunctionTool + Pydantic型定義、pytest 4/4通過]

## 🔹 Agent 3: Infrastructure & Data (`/backend/infrastructure/`)

- [x] WebRTC / WebSocket シグナリングサーバーの基盤構築 (`bidi_stream.py`)
- [x] Firestore スキーマ定義とインメモリ状態管理モック (`state_manager.py`)
- [x] MCPサーバー連携・Context Cachingパイプラインの検証 (`mcp_server.py`, `vertex_cache.py`, `multimodal_pipeline.py`)

## 🔹 Shared Interfaces (`/shared/types/`)

_(JSONペイロードの構造や型定義などの合意事項があればここに追記)_

- [x] APIデータ構造のドラフト作成 (`firestore.d.ts`, `events.d.ts`)
