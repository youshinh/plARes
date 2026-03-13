# plARes: Spatial Awareness & Autonomous Movement

[日本語版 (JP)](jp/spatial_awareness.md)

This document defines the requirements for the Frontend (Module A: Body & Senses), focusing on building an app-less WebAR environment and realizing "zero-latency" local operations.

---

## 1. Tech Stack

- **UI Framework**: React
- **3D/AR Rendering**: Three.js (glTF models, shaders)
- **Spatial APIs**: WebXR Device API (Depth Sensing, Hit Test)
- **Local Input**: Web Speech API (zero-latency OS-native recognition)

---

## 2. AR Spatial Pipeline & NavMesh

plARes uses a hybrid of **Hit Test** and **Depth Sensing** to integrate real-world obstacles into the game.

### 2.1 WebXR Initialization

The app requests both `hit-test` and `depth-sensing` features during the WebXR session startup.

### 2.2 Hit Test (Step Detection)

Uses virtual rays to detect precise coordinates of floors and steps. The results (Pose) are applied to Three.js objects every frame within the rendering loop.

### 2.3 Depth Sensing & Occlusion

Captures full-frame depth data to create a 3D volume of the environment. Custom shaders handle occlusion, clipping robot pixels that are behind real-world objects.

### 2.4 Dynamic NavMesh & Pathfinding

Vertex data from the spatial APIs is used to generate an invisible **NavMesh**.

- **Local Pathfinding**: Routing is calculated locally every frame.
- **Natural Behavior**: Robots automatically steer around obstacles without waiting for cloud inference.

---

## 3. Zero-Latency Local Voice Input

Basic commands (Move, Guard) bypass the cloud AI to ensure instant response.

### 3.1 Local Detection

Uses the **Web Speech API** to convert player voice to text/trigger locally.

### 3.2 Physical Impulse

Detected triggers apply a strong physical impulse to the robot's movement vector or force a new destination in the pathfinding logic.

---

> Refer to [FSM & Priority Control](fsm_priority.md) for behavior arbitration.
