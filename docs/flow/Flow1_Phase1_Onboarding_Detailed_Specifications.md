# **plARes: Game Flow Detailed Specifications**

## **Phase 1: Onboarding (Birth of the Machine and Pilot Contract)**

[日本語版 (JP)](jp/Flow1_プラレスAR_Phase1_オンボーディング詳細仕様書.md)

This specification defines the system flow and data processing structure from the first launch of the "plARes" app to the generation of a unique AI agent (machine) and its first summoning into the real AR space.

### **1. User Experience (UX) Goals**

- **Creation of a "Partner Feeling"**: Instead of just choosing a ready-made avatar, provide an experience where the machine is "extracted and generated" from the player's own information (facial structure, expressions, or words).
- **Frictionless Introduction**: Eliminate the need for native app installation and allow a seamless transition to 3D space from a browser (WebAR) with a few taps.
- **Privacy Considerations**: Naturally incorporate a fallback (alternative) UI for users who are reluctant to take camera photos.

### **2. Screen Transition and UI Control Flow**

Based on the UI mockups of images (693, 694, 695), define the screen transition flow in the frontend (React).

#### **Step 1: Language Auto-Resolution and Selection Screen (Ref: 693.png)**

1. **System Startup**: User accesses the URL.
2. **Auto-Resolution**: The frontend reads `navigator.language` to get the user's browser language (e.g., ja-JP).
3. **UI Display**: Displays a "Choose your language" modal. The automatically obtained language is highlighted by default.
4. **Data Persistence**: The selected language (ja, en, es, etc.) is saved in local storage. It is used to switch i18n dictionaries for subsequent static UI (settings menu, etc.) and is sent as the initial context to the Agent Development Kit (ADK) on the backend.

#### **Step 2: Plareser Generation Screen (Ref: 694.png, 695.png)**

1. **Camera Permission**: Call the browser's `getUserMedia` API to obtain permissions for the front camera.
2. **UI Display**: Displays the front camera footage in real-time in the center of the screen. Place a "📸 Capture" button.
3. **Model Selection**: Allow the user to select the base machine's skeletal type (Heavyweight/Lightweight, etc.) using radio buttons at the bottom of the screen (Model A / Model B).
4. **Skip Path**: Place a "Skip →" button at the bottom left of the screen to ensure a path for the privacy-conscious fallback route.

### **3. Machine Multimodal Generation Engine (Backend Processing)**

Triggered by the user's action (Capture or Skip), the backend's Gemini 2.0 Pro (Vision model) determines the machine's initial status and personality.

#### **3.1 Camera Capture Route (Main Route)**

1. After the user taps "Capture," they press the "Summon Robot!" button.
2. The frontend POSTs the Base64 data of the captured face image and the selected model type (A or B) to the backend API.
3. **Gemini Vision Prompt Execution**:
   - _System Prompt_: "You are an expert robot engineer. Analyze the 'aura,' 'skeletal strength,' and 'richness of expression' from the input person's face image, and generate the initial status of a Plareser with this person as the Master."
   - _Output Schema_: Characterize the output using the specified JSON schema.

#### **3.2 Skip Route (Fallback Route)**

1. User taps "Skip →."
2. The camera footage area switches to a text input area.
3. **Prompt Input**: Have the user enter what kind of machine they want (e.g., "A passionate, speed-oriented wooden robot") in natural language.
4. **Gemini Text Prompt Execution**: Generates initial status using the exact same JSON schema as the capture route based on the input text.

#### **3.3 Determination of Initial Parameters (JSON) and Firestore Storage**

Parse the JSON data returned from Gemini and save it as initial data under `users/{userId}/robots/{robotId}` in Firestore.

**[Key Generated Parameter Group]**

- **Hardware (Physical Characteristics)**
  - `material`: Base material (e.g., wood, metal, resin). For a Master who loves DIY, weighting can be applied so that "impact-resistant wood (Wood)" is more likely to be chosen.
  - `stats`: power (physical), speed (mobility), vit (durability). The total value is capped at a certain amount (e.g., 100).
  - `baseColor`: HEX code for the main color.
- **Software (AI Personality Characteristics)**
  - `tone` (manner of speech/personality): e.g., "Kansai-dialect passionate man," "Cool and intellectual Samurai." This is the most important prompt variable that serves as the base for future TTS (text-to-speech).
  - `talkSkill` (charm/talkativeness): 0-100. A hidden status that affects the probability of spectator item drops (hate control).
  - `adlibSkill` (wit): 0-100. Controls the frequency and eccentricity of spontaneous utterances during environmental recognition (Proactive Audio).

### **4. First Summoning and Spatial Recognition (WebXR Startup)**

Immediately after the machine's data is created in Firestore, the transition to AR space and the first contact take place.

#### **4.1 Starting the AR Session**

1. The screen blacks out and switches to the rear camera footage (WebXR session).
2. **Spatial Recognition**: `Hit Test API` and `Depth Sensing API` start in the background.
3. A reticle (target marker) is displayed in the center of the screen. When the user points the camera at a real floor or table (on flooring or a handmade wooden craft, etc.), the Hit Test recognizes the coordinates of the plane, and the reticle snaps to it.

#### **4.2 Summoning Production and Model Loading**

1. User taps the screen (confirming the placement position).
2. **Dynamic Model Loading**: `Three.js` asynchronously loads the glTF file for the determined base model (A or B). Simultaneously, it applies the `baseColor` generated by Gemini to the material and fine-tunes bone scales (arm thickness, etc.) according to values like `stats.power` for rendering (Server-Driven Rendering).
3. The machine is displayed at the specified coordinates in the AR space with a "landing motion."

#### **4.3 Live API Connection and First Contact**

1. The moment the machine lands, the backend ADK establishes a bidirectional streaming (WebSocket) connection with the Gemini Live API.
2. **Initial Context Injection**: Inject the previously generated `tone` (personality) into the system prompt as the first payload upon connection.
3. **First Contact (Spontaneous Utterance)**: The machine looks up at the player (camera) and gives the first greeting.
   - _Example (when Tone is "Passionate man")_: "Master, sorry to keep you waiting! I can feel your aura loud and clear. Looking forward to working with you from today!"
   - This voice is streamed as a raw audio waveform (Native Audio) and emitted from the machine without lag.

At this moment, onboarding is complete, and the machine transitions to a state of waiting for player instructions (basic autonomous loop: `State.HOVERING`). Preparation for Phase 2 (Daily Co-creation) or Phase 3 (Battle) is complete.
