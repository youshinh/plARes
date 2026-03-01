---
name: webrtc-architect
description: Guides Agent 3 in designing ultra-low latency signaling and Data Channel/Media Stream architectures.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# WebRTC Architect

Use this skill when implementing real-time network communications, distinguishing between WebRTC Data Channels, WebRTC Media, and WebSockets.

## When to Use This Skill

- When designing the signaling server infrastructure.
- When you need to transmit 60fps game coordinates (P2P).
- When streaming high-bandwidth camera frames or microphone arrays to a backend server.

## Instructions

1. **Signaling Server**:
   - Implement signaling (SDP offer/answer and ICE candidates exchange) using Firebase Realtime Database (simplest) or bare-metal WebSockets.
2. **Data Channels (10-30ms target)**:
   - Use unreliable, unordered UDP Data Channels for character movement vectors and highly frequent coordinates. Losing a single packet is fine; late packets should be dropped, not retried.
3. **Media Streams**:
   - Extract raw video/audio tracks using standard Web APIs (`getUserMedia`).
   - Implement backend WebRTC media pipelines using Pipecat, AIORTC, or LiveKit to reliably ingest these tracks into the Gemini Bidi-stream.
4. **WebSocket Sync**:
   - Use WebSockets strictly for exact-state event synchronization (e.g., round end, critical hit confirmation, AI text outputs) where TCP reliability and ordering are required.

## Examples

### Data Channel Configuration

```javascript
// For movement data, disable ordering and retransmits for maximum speed
const dataChannelOptions = {
  ordered: false,
  maxRetransmits: 0,
};
const movementChannel = peerConnection.createDataChannel(
  "movement",
  dataChannelOptions,
);
```
