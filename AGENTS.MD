# AGENTS.md: PlaresAR Master Development Design & Agent Skills

**Target**: AI Development Agents participating in the project (Agents 1, 2, and 3)
**Purpose**: This document serves as the master design instruction for "PlaresAR", a next-generation WebAR x AI multi-agent battle game set in real-world spaces. It defines the architecture, tech stacks, directory responsibilities, specific skills, and development rules for the 3 parallel development agents.

## 1. Project Vision

PlaresAR is a metaverse game where players summon their original AI robots (PlaresWrestlers) onto real-world surfaces (desks, living room floors, DIY woodwork) and command them to fight using voice and gestures. It blends high competitiveness with the joy of DIY, offering an advanced entertainment experience where audiences can join and expand the game via web browsers without needing dedicated apps.

## 2. Collaboration Rules & Directory Structure

To prevent conflicts during 3-agent parallel development, the frontend (body) and backend (brain/nervous system) are completely separated in an asynchronous hybrid design. Strive to adhere to the following rules:

### 2.1 Strict Directory Separation

Each agent must only implement code within their assigned directory. Do not directly interfere with other agents' directories.

- `/frontend/`: Agent 1's domain (Frontend/XR). Module A.
- `/backend/ai_core/`: Agent 2's domain (Backend AI). Module B.
- `/backend/infrastructure/`: Agent 3's domain (Data/Networking). Modules C & D.
- `/shared/`: Shared domain for schema definitions and config files.

### 2.2 Contract-First Development (Interface-Driven)

Before implementation, define and agree upon the data structures (payloads) for language-independent JSON data (e.g., `{"event": "critical_hit", "user": "p1"}`) in `/shared/types/` as TypeScript Interfaces or Python Pydantic models.

### 2.3 Asynchronous Sync (`PROGRESS_SYNC.md`)

Maintain `PROGRESS_SYNC.md` in the project root. Agents must update this file when completing tasks or creating API mocks, and read it when starting tasks to understand the progress of other agents.

---

## 3. Agent Modules & Implementation Requirements

### Agent 1: Frontend & XR (The Edge)

**Role**: Browser rendering, AR spatial recognition, and autonomous movement via local computation (reflexes).
**Directory**: `/frontend/`
**Target Module**: Module A (Body & Senses)
**Tech Stack**: React, Three.js, WebXR Device API, Web Speech API

#### Required Skills & Implementation Requirements

- **Server-Driven UI**: Bind language-independent JSON data (e.g., tactic panels) received via WebSocket to React State for dynamic UI rendering.
- **Advanced WebGL & Three.js**: Render glTF models, manipulate materials dynamically with custom shaders (e.g., battle scars), apply bone scale modifications (`bone.scale.set(x,y,z)`) upon leveling up, and render particle effects for special moves.
- **Spatial Computing & WebXR**: Utilize `Hit Test API` and `Depth Sensing API` to generate 3D meshes of real-world surfaces in real-time. Implement spatial occlusion to hide models behind real-world obstacles using depth data (`XRDepthInformation`).
- **Rapid FSM & Local Pathfinding**: Dynamically generate NavMeshes from spatial vertex data. Implement a 3-layer Priority Finite State Machine (FSM) inside `requestAnimationFrame`:
  - _Priority 1_: Emergency evasion via zero-latency local voice detection.
  - _Priority 2_: JSON command overrides from the backend AI.
  - _Priority 3_: Local NavMesh basic routing & pathfinding (e.g., via `recast-wasm` or `three-pathfinding`).
- **Latency-Hiding UX**: Use Web Speech API for instant physical impulse conversion. For special moves, instantly trigger a ~3-second "charge animation" to hide backend communication latency (motion-first logic).

#### Specific Skill Tags

- `SKILL_Frontend_01`: Server-Driven UI Implementation
- `SKILL_Frontend_02`: Advanced WebGL & Three.js
- `SKILL_Frontend_03`: Spatial Computing & WebXR
- `SKILL_Frontend_04`: Rapid FSM & Local Pathfinding
- `SKILL_Frontend_05`: Latency-Hiding UX

---

### Agent 2: Backend AI & Streaming (The Brain)

**Role**: Bidirectional streaming, advanced inference, articulation/enthusiasm scoring, and macro-tactics using Gemini 3.1 Pro.
**Directory**: `/backend/ai_core/`
**Target Module**: Module B (Brain & Strategy)
**Tech Stack**: Python, Agent Development Kit (ADK) / Antigravity, Gemini Multimodal Live API

#### Required Skills & Implementation Requirements

- **Non-blocking Control & Python Asyncio**: Master `asyncio.gather()` and thread-safe buffers (`LiveRequestQueue`) to concurrently run upstream (video/audio ingestion) and downstream (AI responses/JSON output) tasks without blocking user interruptions.
- **Multimodal Live API Operator**: Build stream pipelines pushing 1-2fps camera frames and continuous 16kHz PCM audio to Gemini for real-time situational and gesture awareness.
- **Native Audio Semantic Analysis**: Bypass STT. Feed raw audio waveforms directly to the model. Design prompts to evaluate the player's "accuracy", "speed", and "spirit/volume" from the voice, outputting a critical hit score (0.0 to 1.0) as JSON.
- **Dynamic Prompting & Tone Control**: Bind personality variables to system prompts to control the robot's tone. Autonomously shift the persona based on match history or audience intervention. Use strict few-shot constraints (e.g., "Keep it under 15 chars") to prevent verbosity.
- **JSON Function Calling**: Output language-independent macro-tactic commands (e.g., `{"action": "take_cover"}`) based on video/audio context.

#### Specific Skill Tags

- `SKILL_AI_01`: Non-Blocking Subroutine & Python Asyncio
- `SKILL_AI_02`: Multimodal Live API Operator
- `SKILL_AI_03`: Native Audio Semantic Analysis
- `SKILL_AI_04`: Dynamic Prompting & JSON Function Calling

---

### Agent 3: Infrastructure, Data & GenAI (The Nervous & Data System)

**Role**: Ultra-low latency networking, Firestore modeling, MCP integration, and image/video GenAI batch processing.
**Directory**: `/backend/infrastructure/` & `/shared/`
**Target Module**: Module C (Nervous) / Module D (Data & Memory) / Extended Ent.
**Tech Stack**: WebRTC, WebSocket, Firebase/Firestore, MCP, Nano Banana Pro, Veo 3.1, Lyria API

#### Required Skills & Implementation Requirements

- **Protocol Segregation**:
  - _WebRTC Data Channel_: Fast P2P coordinate/vector sync (targeting 10-30ms latency).
  - _WebRTC Media Stream_: Stable streaming of mic audio and camera feeds (via Pipecat/Daily).
  - _WebSocket_: Millisecond precision pub/sub for AI JSON commands and state events.
- **Signaling & Matchmaking**: Implement Firebase Realtime DB/Firestore for IP/port signaling and QR/URL instant matchmaking.
- **Resource-Optimized NoSQL & State Management**: Design normalized schema (e.g., `users/{userId}/robots/{robotId}`). Keep high-frequency in-match state in ADK local memory/Redis. Commit a single highly-summarized match log (`aiMemorySummary`) to Firestore post-match to optimize costs.
- **Model Context Protocol (MCP)**: Deploy "Managed MCP servers for Firestore" granting the AI autonomous tool permissions to query match histories (`matchLogs`).
- **Context Caching**: Load massive context (past battles, physics rules) into Vertex AI Context Caching at startup to slash Time To First Token (TTFT).
- **Asynchronous Gating Pipeline**: Implement event-driven (e.g., every 5 matches) batched GenAI pipelines without blocking the UI. Includes "8-Image Mix" (Nano Banana Pro) for 1-2s audience-submitted 3D texture mapping, and Veo 3.1/Lyria API for highlight videos.

#### Specific Skill Tags

- `SKILL_Infra_01`: Ultra-Low Latency Protocol Segregation
- `SKILL_Infra_02`: Resource-Optimized NoSQL Modeling
- `SKILL_Infra_03`: Model Context Protocol (MCP) Setup
- `SKILL_Infra_04`: Context Caching for Speed
- `SKILL_Infra_05`: Asynchronous Gating Pipeline

---

## 4. Core Principles (Agent Behavioral Guidelines)

- **Developer Knowledge MCP Server**: Autonomously use MCP tools to search official tech docs (Google Cloud, etc.) in real-time whenever implementation doubts arise.
- **Dynamic Gating & Cost Minimization**: Ensure heavy computation (video streaming, Veo 3.1) is purely event-driven and deactivated when inactive.
- **Claude Code Skills Extension**: Write custom skills (`SKILL.md`) inside the `.claude/skills/` root folder to let agents learn new ADK tools autonomously.

## 5. Gemini-Native Paradigm Shift

Banish the traditional "send a prompt, wait for text" mechanics.

1. **Pervasive Context Caching**: Stop sending base prompt instructions on every frame. Cache personality and rules once.
2. **Multimodal Bidi-streaming**: Seamlessly interleave user visual/audio streams with AI voice/JSON outputs at the infrastructure level.

## 6. Future Extensibility (from Awesome ADK Agents)

Consider the following architectural patterns for future project growth:

1. **A2A (Agent-to-Agent) Protocol**: Standardize communication between the core system and audience/external agents.
2. **Firestore Session Service**: Migrate from `InMemorySessionService` to a highly scalable Cloud Run + Datastore architecture.
3. **Ralph Loop (Verify, Not Guess)**: Embed self-verification steps where agents auto-iterate and fix generated logic before deploying it to users.
4. **MCP Agent Tool Adapters**: Wrap existing MCP tools as direct ADK Native Tools/Sub-Agents.

---

## 7. Design Reference Guide: NotebookLM Specs (MUST READ)

The master source of truth for all design specs relies on a NotebookLM document loaded with over 60 sources. Consult it before implementation or when specifications are unclear.

### Notebook Info

- **Title**: PlaresAR: The Heated Battle Sketched with Next-Gen AI Agents
- **Notebook ID**: `46106b3a-80d5-4567-85c4-25dc3ee293cc`
- **URL**: https://notebooklm.google.com/notebook/46106b3a-80d5-4567-85c4-25dc3ee293cc

### How to Query via MCP

Use the `mcp_notebooklm_notebook_query` tool:

```python
mcp_notebooklm_notebook_query(
  notebook_id="46106b3a-80d5-4567-85c4-25dc3ee293cc",
  query="Specification you want to check, e.g., 'WebRTC Data Channel coordinate sync implementation details'"
)
```

### How to Query via CLI

```bash
# Direct natural language query
nlm query "46106b3a-80d5-4567-85c4-25dc3ee293cc" "Query text"

# View notebook details
nlm describe notebook 46106b3a-80d5-4567-85c4-25dc3ee293cc

# List sources
nlm list sources 46106b3a-80d5-4567-85c4-25dc3ee293cc
```

> **IMPORTANT**: NotebookLM frequently holds more detailed and updated information than local `/docs/*.md` files. Thus, querying NotebookLM is highly prioritized.

---

## 8. Approved Gemini Models & Usage Policy

> [!CAUTION]
> **AGENTS MUST ONLY USE THE MODELS LISTED BELOW.** Do NOT use any other Gemini model variants (e.g., `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-pro`, etc.). Using an unlisted model is a project rule violation.

The following models are the **only approved models** for this project. Select the model strictly based on its designated use case:

| Model                                           | Primary Use Case in PlaresAR                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gemini-3.1-pro-preview`                        | **Deep reasoning & strategy** — Complex agentic workflows, macro-tactic decision-making, long-context match history analysis, software engineering tasks, and multi-step tool use (Agent 2 main brain).                                        |
| `gemini-3-flash-preview`                        | **General backend inference** — Interactive agentic loops, fast function calling, JSON command generation, and moderate reasoning tasks where near-Pro quality is needed at lower latency (Agent 2 real-time inference).                       |
| `gemini-flash-lite-latest`                      | **Lightweight / high-frequency tasks** — Cost-sensitive, high-volume, low-complexity tasks: simple JSON extraction, lightweight chat responses, health checks, and any non-critical inference that must be cheap and fast.                     |
| `gemini-2.5-flash-native-audio-preview-12-2025` | **Real-time audio streaming** — Bidirectional voice conversation (Multimodal Live API), native audio semantic analysis (scoring player voice: accuracy / speed / spirit), live voice command recognition, and multi-speaker scenarios in-game. |
| `gemini-2.5-flash-preview-tts`                  | **Text-to-Speech (non-streaming)** — Robot character voice generation, pre-rendered battle commentary narration, multi-character dialogue (podcasts, highlight reels), and any case where expressive TTS with style control is needed.         |
| `gemini-3.1-flash-image-preview`                | **Image generation & editing** — Generating robot skin textures from audience submissions ("8-Image Mix"), T2I for robot appearance customization, real-time texture editing, and any image generation/editing pipeline.                       |

### Decision Guide

```
Need deep strategy / complex agent loop?      → gemini-3.1-pro-preview
Need fast agent inference / function calling? → gemini-3-flash-preview
High-volume / cheap / simple task?            → gemini-flash-lite-latest
Real-time voice in/out (Live API)?            → gemini-2.5-flash-native-audio-preview-12-2025
Pre-rendered TTS / narration?                 → gemini-2.5-flash-preview-tts
Image generation or editing?                  → gemini-3.1-flash-image-preview
```

> **IMPORTANT**: When in doubt between Flash and Pro, default to `gemini-3-flash-preview`. Only escalate to `gemini-3.1-pro-preview` when the task explicitly requires frontier-level reasoning or very long context (>500k tokens).
