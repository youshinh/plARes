# Gemini Live API 接続アーキテクチャ

最終更新: 2026-03-07

## 概要

plARes には複数の Gemini / live 系経路がある。
問題は「経路が複数あること」ではなく、**責務ごとの主系統と fallback がコード上で明文化されていないこと**だった。

この文書では、現在の実装と Phase 2 目標を分けて定義する。

## 経路定義

### Route A: Browser Direct Live

```
Browser -> GeminiLiveService.ts -> Ephemeral Token -> Gemini Live API
```

| 項目 | 値 |
| --- | --- |
| ファイル | `frontend/src/services/GeminiLiveService.ts` |
| 認証 | Ephemeral Token (`/ws/game` 経由で発行) |
| 用途 | 低遅延の live 音声入出力、短文実況、live transcript |
| 特徴 | もっとも低遅延。ブラウザの mic / secure context に依存 |
| モデル | `gemini-2.5-flash-native-audio-preview-12-2025` |

### Route B: Game Socket Interaction

```
Browser -> /ws/game -> interaction_turn -> GenAIRequestService -> Gemini Sync API
```

| 項目 | 値 |
| --- | --- |
| ファイル | `frontend/src/services/WebSocketService.ts`, `backend/ai_core/genai_request_service.py` |
| 認証 | Backend service account / server-side client |
| 用途 | 短い戦術提案、同期型の 1-turn interaction |
| 特徴 | 現在の battle coaching 主系統。ADK ではない |
| モデル | `gemini-3-flash-preview` |

### Route C: Audio Judge Socket

```
Browser PCM -> /ws/audio -> AudioSessionService -> AudioJudgeService
```

| 項目 | 値 |
| --- | --- |
| ファイル | `frontend/src/hooks/useAudioStreamer.ts`, `backend/ai_core/audio_session_service.py` |
| 認証 | Game session に紐づく websocket |
| 用途 | 必殺詠唱の判定、accuracy / speed / passion 算出 |
| 特徴 | 現在は PCM heuristic + Gemini 補助の hybrid |

### Route D: ADK Live Relay

```
Browser -> /ws/live -> bidi_session.py -> ADK Runner -> Gemini Live API
```

| 項目 | 値 |
| --- | --- |
| ファイル | `backend/ai_core/streaming/bidi_session.py`, `backend/ai_core/agents/articulation_agent.py` |
| 認証 | Backend service account |
| 用途 | ADK live conversation, future tool calling, future memory-aware coaching |
| 特徴 | 現在は限定利用。ゲーム本編の主系統ではない |

### Route E: Game Event Vision Trigger

```
Browser -> /ws/game event(walk_vision_trigger) -> GameApplication -> DialogueService
```

| 項目 | 値 |
| --- | --- |
| ファイル | `frontend/src/App.tsx`, `backend/ai_core/game_application.py` |
| 用途 | 散歩中の vision trigger / proactive line |
| 特徴 | 現在は browser direct live ではなく、game socket の event として処理 |

## 責務マトリクス

### 現在の実装

| 責務 | 主系統 | fallback | 備考 |
| --- | --- | --- | --- |
| `conversation` | Route A | なし | live 会話は browser direct |
| `battle_coaching` | Route B | なし | 現状は ADK ではなく interaction_turn |
| `voice_attack_scoring` | Route C | local heuristic | `/ws/audio` 専用 |
| `commentary` | Route A | Route B | text ping は Route A 優先 |
| `vision_trigger` | Route E | なし | `walk_vision_trigger` event |

### Phase 2 目標

| 責務 | 主系統 | fallback | 備考 |
| --- | --- | --- | --- |
| `conversation` | Route A | Route D | 低遅延優先を維持 |
| `battle_coaching` | Route D | Route B | ADK tool calling を主系統化 |
| `voice_attack_scoring` | Route C | local heuristic | raw audio 主体へ寄せる |
| `commentary` | Route A | Route B | live unavailable 時は sync interaction |
| `vision_trigger` | Route E | Route B | まずは game event を維持 |

## 実装ルール

1. `battle_coaching` を browser direct live に混ぜない。
2. `/ws/audio` に battle state JSON を相乗りさせない。
3. `walk_vision_trigger` は当面 `/ws/game` event のまま扱う。
4. ADK unavailable 時は silent fail しない。必ず UI に degraded reason を返す。
5. route 選択は frontend の単一ポリシー定義から行う。

## Frontend の固定点

`frontend/src/hooks/useLiveRouteSelector.ts` を live 責務の単一ソースとし、以下を定義する。

- current policy
- target policy
- responsibility -> route 解決
- route 未実装時のガード

`useLiveSessionControls.ts` はこの selector を通してのみ live route を決める。

## Degraded Mode ルール

| ケース | UI 要件 |
| --- | --- |
| Gemini token 発行失敗 | 接続不可理由を字幕 or status で表示 |
| ADK live unavailable | `ADK live unavailable` を明示し、本編は継続 |
| mic denied | 再試行可能な状態に戻す |
| camera denied | skip / upload へ遷移可能 |
| network unstable | websocket reconnect / live reconnect の成否を表示 |

## 今回の Phase 1 完了条件

- この責務マトリクスがコードの selector と一致している
- `release_checklist.md` が CI / Browser E2E / Manual に分離されている
- smoke スクリプトが current policy を前提に回せる
