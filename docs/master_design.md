# plARes Master Design Specification

[日本語版 (JP)](jp/master_design.md)

plARes is a next-generation WebAR x AI multi-agent battle game where you summon your own original AI robot (Pla-Wrestler) onto a real-world stage (living room floors, desks, DIY woodcrafts, etc.) and command it using voice and gestures.

It's not just a fight between strong machines; it's a fusion of "competitiveness" and the joy of "making things (DIY)." Built as a high-end WebAR entertainment system, it requires no app installation—spectators (audience) can join via a browser just by sharing a URL.

---

## 1. Documentation Index

The following documents define the technical specifications of the plARes system. While filenames are descriptive, they follow this logical sequence:

1.  **[AI Instructions](ai_instructions.md)**: Master prompt and multi-agent directives.
2.  **[Spatial Awareness](spatial_awareness.md)**: WebXR, Hit Test, and NavMesh generation.
3.  **[FSM & Priority Control](fsm_priority.md)**: 3-layer priority steering for autonomous behavior.
4.  **[Streaming Backend](streaming_backend.md)**: Bidirectional streaming and ADK integration.
5.  **[Voice & Latency](voice_latency.md)**: Latency hiding and Native Audio voice judging.
6.  **[Data & Memory Bank](data_memory.md)**: Firestore schema and Context Caching.
7.  **[AI Evolution](ai_evolution.md)**: Persona shifts, long-term memory, and proactive audio.
8.  **[Multiplayer Sync](multiplayer_sync.md)**: WebRTC P2P sync and Cloud Anchors.
9.  **[Multimodal Craft](multimodal_craft.md)**: Reality Fusion using Imagen and Veo.
10. **[Dynamic UI](dynamic_ui.md)**: Server-Driven UI and emotional translation.
11. **[Game Supplement](game_supplement.md)** (⭐ Essential): Constants, material logic, and rules.
12. **[Game Expansion](game_expansion.md)** (⭐ Essential): Training/Walk modes and dynamic evolution.
13. **[Character Quality](character_quality.md)**: Commercial-grade generation and DNA system.
14. **[CC0 Pipeline](cc0_pipeline.md)**: Asset procurement and licensing rules.
15. **[Execution Plan](execution_plan.md)**: Task breakdown and development roadmap.

---

## 2. Hybrid System Architecture

To balance "zero-latency (competitiveness)" with "high-level AI reasoning," plARes adopts an **asynchronous hybrid design** where the Frontend (Body/Senses) and Backend (Brain/Strategy) are completely decoupled.

### Module A: Frontend (Body & Senses)

- **Tech Stack**: React, Three.js, WebXR Device API
- **Role**: Builds the app-less WebAR environment. It scans real-world surfaces, generates a dynamic NavMesh using Hit Test and Depth Sensing APIs. Basic operations like movement and defense are processed locally with zero latency using the **Web Speech API**.

### Module B: Backend AI (Brain & Strategy)

- **Tech Stack**: Python, Agent Development Kit (ADK), Gemini 1.5/2.5/3.x (Live API, Imagen, etc.)
- **Role**: Running on **Cloud Run**, it handles heavy processing. It maintains a thread-safe `LiveRequestQueue` for each session and processes video/audio streaming concurrently. It handles user interruptions and hosts multiple agents for voice judging, tactical commands (Function Calling), and live commentary.

### Module C: Real-time Communication (Nerves)

- **Tech Stack**: WebRTC (Data Channel / Media Stream), WebSocket
- **Role**: Strict protocol separation. **WebRTC Data Channel** (UDP/P2P) is used for robot coordinates and basic action sync (10-30ms lag). **WebRTC Audio/Video Stream** handles heavy AI media, while **WebSocket** is used for language-independent event sync (e.g., damage notifications).

### Module D: Data & Memory (State)

- **Tech Stack**: Google Cloud Firestore, Firebase Authentication
- **Role**: To avoid high API costs and latency, real-time state management is kept in ADK local memory/session. At the end of a match, the AI summarizes events and updates Firestore's long-term memory (`aiMemorySummary`) and match history (`matchLogs`).

---

## 3. Core Features

### 3.1. 3-Layer Priority FSM

To prevent stuttering and realize natural behavior, a 3-layer priority control is implemented in the rendering loop:

1.  **Priority 1 (High)**: Local voice emergency interruption (Web Speech API). Action: Immediate dodge/impulse.
2.  **Priority 2 (Mid)**: AI-driven macro-tactical interruption (Function Calling). Action: Strategic repositioning.
3.  **Priority 3 (Low)**: Local base autonomous loop. Action: Pathfinding on NavMesh.

### 3.2. Latency Hiding & Native Audio Judging

Hidden AI inference lag (1-2s):

- **Latency Hiding**: A 3-second charge animation starts immediately on the frontend while streaming voice to the backend.
- **Native Audio**: Raw audio (16kHz PCM) is sent directly to Gemini Live API, bypassing STT. The Voice Judge scores "Accuracy," "Speed," and "Spirit" (volume/tremor) before the animation ends.

### 3.3. Multimodal Integration

- **Reality Fusion (Imagen)**: Dynamic texture generation from audience-submitted photos.
- **Milestone Videos (Veo/Lyria)**: Asynchronous batch generation of cinematic highlights and victory anthems (BGM) based on match logs.

---

> ⚠️ **Read [Game Supplement](game_supplement.md) and [Game Expansion](game_expansion.md) for essential constants and rule logic before implementation.**
