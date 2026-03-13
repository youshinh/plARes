# plARes: Real-time Network & Multiplayer Sync

[日本語版 (JP)](jp/multiplayer_sync.md)

This document defines the communication layer required for "zero-latency" action and "perfect sync" in AR spaces, using strict protocol separation and cloud-anchored matching.

---

## 1. Communication Architecture: Protocol Separation

### 1.1 WebRTC Data Channel (UDP/P2P) - Ultra Low Latency

- **Usage**: Robot X,Y,Z coordinates, movement vectors, and attack triggers.
- **Requirement**: Direct P2P connection to keep lag between 10-30ms.

### 1.2 WebRTC Audio/Video Stream - Multimedia

- **Usage**: Bidirectional streaming to **Gemini Live API**.
- **Requirement**: Uses Pipecat/Daily to stream voice/video frames for AI processing.

### 1.3 WebSocket - Language-Agnostic Events

- **Usage**: Judging results (JSON), buff/debuff applications, and spectator items.
- **Requirement**: Abstracted JSON events (e.g., `{"event": "critical_hit"}`) published to all clients in milliseconds.

---

## 2. Spatial Sync & AR Anchors

### 2.1 Local Battle (Cloud Anchors)

For players in the same room. The host scans the floor to create a 3D mesh and "Cloud Anchors." Guests scan the same room to align coordinates instantly.

### 2.2 Online Remote Battle (Virtual Arena Overlay)

For players in different locations. The host's room topography is sent as a lightweight JSON to the guest. The guest sees the host's room obstacles as holographic digital overlays to ensure consistent gameplay boundaries.

---

## 3. Matching & Signaling

- **Signaling**: Uses Firebase Realtime DB/Firestore for SDP/ICE exchange.
- **Lobby**: URL/QR-based entry. Users can join as a spectator or opponent simply by scanning a code (WebAR strength).

---

## 4. Fairness & Robustness

- **Sync Rate**: 30Hz default.
- **Disconnection**: 3s timeout leads to pause; 15s leads to TKO (forfeiture).
- **Anti-Cheat**: Server validation of speed and distance. In-memory state is the source of truth durante battle.

---

> Refer to [Streaming Backend](streaming_backend.md) for backend orchestration.
