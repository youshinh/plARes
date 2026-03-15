# System Architecture

The architecture diagram mentioned is located at [overview.png](file:///Users/you/code/plaresAR/docs/overview.png) and the game flow diagram is at [flow.png](file:///Users/you/code/plaresAR/img/flow.png).

## Mermaid Diagram

```mermaid
graph TD
    subgraph "Client (Frontend - Module A)"
        Browser["Web Browser (React / Three.js)"]
        WebXR["WebXR (Spatial Awareness)"]
        FSM["3-Layer Priority FSM"]
        SpeechAPI["Web Speech API"]
    end

    subgraph "Backend AI (Brain - Module B) / Cloud Run"
        AI_Core["AI Core (Python / FastAPI)"]
        ADK["Agent Development Kit (ADK)"]
        Dialogue["Dialogue Service"]
        AudioJudge["Audio Judge Service"]
    end

    subgraph "Infrastructure (Nerves - Module C)"
        WebSocket["WebSocket Server"]
        WebRTC["WebRTC Signaling / P2P"]
    end

    subgraph "External Services / Data (Module D)"
        GeminiLive["Gemini Live API (Direct)"]
        GeminiSync["Gemini Sync API"]
        Firestore["Google Cloud Firestore"]
        ManagedMCP["Managed MCP (Firestore Tool)"]
    end

    %% Interactions
    Browser <--> WebSocket
    WebSocket <--> AI_Core
    
    %% Route A: Direct Live
    Browser <-->|Route A: Native Audio| GeminiLive
    
    %% Route B: Game Socket Interaction
    AI_Core <--> GeminiSync
    
    %% Route D: ADK Live Relay
    AI_Core --> ADK
    ADK <--> GeminiLive
    
    %% Data Persistence
    AI_Core <--> Firestore
    ADK <--> ManagedMCP
    ManagedMCP <--> Firestore
    
    %% P2P Sync
    Browser <-->|WebRTC Data Channel| Browser
    
    %% Logic Flow
    WebXR --> Browser
    FSM --> Browser
    SpeechAPI --> Browser
```
