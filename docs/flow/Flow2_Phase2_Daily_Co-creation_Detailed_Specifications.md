# **plARes: Game Flow Detailed Specifications**

## **Phase 2: Daily Co-creation (Stroll/Training Mode)**

[日本語版 (JP)](jp/Flow2_プラレスAR_Phase2_日常の共創詳細仕様書.md)

This specification defines the system flow and implementation requirements for two modes (Stroll and Training) in "plARes" to nurture "memory (context)" and "bond (sync rate)" for the AI agent through daily communication outside of matches.

### **1. User Experience (UX) Goals**

- **Ambient Presence**: Make the player feel that the machine is not just a game piece but a "partner who recognizes the real world together."
- **Infinite Craft Experience**: Provide the joy of "local procurement" by seamlessly incorporating the user's hobbies (DIY works, etc.) and daily items (dinner side dishes, etc.) into the game.
- **Real-life Skill-up**: Let the player experience true "special training" that is not just button-mashing, by having the system evaluate their own "articulation" and "spirit."

### **2. Stroll Mode (Outings, Exploration, Crafting)**

A mode for walking through real space together, interacting with AI, and generating items. It fully utilizes the Multimodal Bidi-streaming (bidirectional streaming) of the Gemini Live API (`gemini-2.5-flash-native-audio-preview-12-2025`).

#### **2.1 Autonomous Movement via WebXR (Local Processing)**

The frontend foundation for naturally walking around the real world while eliminating communication lag.

1. **Spatial Scan**: Always-on WebXR Device API (Hit Test API / Depth Sensing API) to 3D mesh the shape of the room captured by the smartphone camera.
2. **Dynamic NavMesh Generation**: Dynamically generate a polygon area (NavMesh) where the character can walk on Three.js via local calculation from the obtained vertex data.
3. **Autonomous Actions**: In a state with no special instructions from the Cloud AI (`State.HOVERING`), the machine autonomously walks on this NavMesh, smoothly bypassing or climbing steps of wooden furniture made by the player.

#### **2.2 Vision Integration and Proactive Dialogue**

A system where the AI looks at the real landscape and talks to the player spontaneously.

1. **Streaming Start**: Thin out the smartphone's rear camera footage to 1-2 fps and continuously feed it into the `LiveRequestQueue` managed by the backend ADK (Agent Development Kit).
2. **Context Recognition**: Gemini Live API (`gemini-2.5-flash-native-audio-preview-12-2025`) monitors the footage. Trigger an event when a specific object is detected based on the numerical value of the user's `personality.adlibSkill` (wit).
3. **Utterance Example (Recognition of DIY Woodwork)**:
   - _User Background_: Works for a lumber manufacturer and is good at DIY.
   - _AI Reaction_: Vision detects handmade wooden stairs, flooring, or DIY projects in the room.
   - _Spontaneous Utterance (TTS)_: "Oh, Master. This wood has a great smell and texture (feel)! Is this your work? I want my armor reinforced with this kind of sturdy wood too!"—playing commentary matched to the context with low latency.

#### **2.3 Real-World Fusion Craft (Local Procurement of Items)**

A system for 3D-digitizing daily items and saving them to the inventory.

1. **Multimodal Input**: The user takes a photo of a real-world item (e.g., "Fried Spring Roll" for dinner). Enters a prompt into the text box, such as "Make this a legendary holy sword that fires lasers," and sends it.
2. **8-Image Mix (Image Fusion)**:
   - Call the backend's Nano Banana Pro (`gemini-3.1-flash-image-preview`) API.
   - Fuse the crispy "texture/shape" of the spring roll with the "concept" of a holy sword to dynamically generate a new 3D texture (or 2.5D billboard image) in 1-2 seconds.
3. **Data Persistence**: The generated asset URL is saved in `users/{userId}/inventory` in Firestore and can be dynamically attached to the machine's right-hand bone, etc., via `mesh.add()` in the customization screen.

### **3. Training Mode (Sync Special Training)**

A solo mini-game to train "reflexes" and "articulation (incantation for special moves)" for matches. A hybrid design is adopted to minimize communication costs.

#### **3.1 Hybrid Gating Design (Local Reflex Training)**

Frontend processing to keep API costs at zero.

1. **Obstacle Avoidance Game**: Obstacles such as logs and iron plates approach the machine from the back of the AR space.
2. **Local Voice Detection**: The player shouts "Right!" or "Dodge!" The standard browser Web Speech API converts the voice to text with zero delay.
3. **State Forced Overwrite**: The moment text is detected, "Priority 1 (Highest Priority)" of the 3-layer priority control state machine in the frontend fires. It adds a physical impulse to the machine and executes the avoidance action with zero lag.

#### **3.2 Articulation Judgment Agent (Native Audio Analysis)**

The core system that judges the accuracy of the special move incantation and increases the sync rate.

1. **Incantation Trigger**: A random tongue twister prompt (e.g., "Super Hot Fried Spring Roll Strike!") is displayed as a telop on the screen.
2. **Native Audio Transmission**: Stream the player's uttered voice (16kHz PCM waveform data) raw to `gemini-2.5-flash-native-audio-preview-12-2025` without going through STT (text-to-speech).
3. **3-Axis Evaluation Logic**: The backend's "Articulation Judgment Agent" calculates scores (0.0 to 1.0) on three axes:
   - **Accuracy**: Whether it was pronounced according to the specified text.
   - **Speed**: Time until the completion of the incantation.
   - **Passion/Sentiment**: Loudness, tremor, and heat of the voice (analysis unique to Native Audio).
4. **Reflection of Results**: Depending on the overall score, the "Sync Rate" between the machine and the player increases. This numerical value is updated (`Update`) in the machine's data in Firestore and directly links to the "critical occurrence rate" and "AI's obedience to player instructions" during matches.

#### **3.3 Latency Hiding System (Ensuring UX)**

Implementation to prevent the player from noticing the API communication lag (1-2 seconds) for articulation judgment.

1. The moment the player finishes the incantation (or releases the microphone button), the frontend immediately starts a 3-second "incantation animation where the machine accumulates an aura (`State.CASTING_SPECIAL`)" without waiting for the API's judgment result.
2. Receive result JSON from the backend before the animation ends.
3. Evaluate the result in the animation end hook (`onAnimationEnd`). If successful, draw a flashy attack effect; if failed (poor articulation, etc.), branch to a motion where the machine stumbles.

### **4. Memory Fixation (Preparation for Phase Transition)**

At the timing when the stroll or training mode ends, make these experiences part of the AI's "flesh and blood."

1. The backend Python server passes event logs within the session (e.g., made a spring roll sword, high spirit score in incantation) to `gemini-3.1-pro-preview` to summarize them.
2. The summarized text is merged and updated into `aiMemorySummary`, a long-term memory document in Firestore.
3. This completes the foundation for the machine to make utterances based on the context, such as "Let's put in the same spirit as that previous training!" in the next match (Phase 3) or next stroll.
