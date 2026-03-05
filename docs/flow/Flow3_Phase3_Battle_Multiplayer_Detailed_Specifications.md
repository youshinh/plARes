# **plARes: Game Flow Detailed Specifications**

## **Phase 3: Battle (AR Multiplayer Match)**

[日本語版 (JP)](jp/Flow3_プラレスAR_Phase3_実戦_マルチプレイ詳細仕様書.md)

This specification defines the system flow and implementation requirements for communication synchronization, AI autonomous control, and spectator intervention systems in real-time battles in AR space, which is the main content of "plARes."

### **1. User Experience (UX) Goals**

- **Fair AR Arena**: Systematically integrate different real environments (your own table and your opponent's living room, etc.) to build a fair battlefield.
- **Complete Latency Hiding of Thinking**: Realize the separation of "reflexes" and "strategic brain," allowing the player to feel no API response waiting time (1-2 seconds lag) characteristic of Cloud AI (Gemini).
- **Chaotic Co-creation Experience**: Let the player enjoy agent behavior like "ignoring instructions" or "complaining" based on spectator intrusion or their own personality, rather than just being a piece that moves as instructed.

### **2. Battle Preparation and AR Space Synchronization (Virtual Arena Construction)**

The space synchronization flow in matches across a network (e.g., Osaka home vs. parents' home in Toyonaka).

#### **2.1 Matching and Protocol Establishment**

1. **Signaling**: Match the host and guest using Firebase.
2. **Separation of Communication Paths**:
   - WebRTC Data Channel (UDP/P2P): For synchronizing coordinates, HP/AP, and basic actions (10-30ms delay goal).
   - WebSocket: For streaming and sending/receiving JSON commands with the backend ADK (Gemini Live API: `gemini-2.5-flash-native-audio-preview-12-2025`).

#### **2.2 Virtual Arena Superimposition (Terrain Synchronization)**

A system to prevent the machine from unreasonably getting stuck in obstacles in each other's rooms.

1. **Terrain Scan and Transmission**: Convert the host's (home) WebXR-scanned room's NavMesh data and 3D bounding boxes of prominent obstacles (e.g., a handmade wooden low table) into JSON and send them to the guest (parents' home).
2. **Hologram Rendering**: On the guest's screen, the host side's wooden low table is superimposed as a "semi-transparent digital wall (hologram)" on top of their own room's landscape.
3. The machine will fight on this "common physical calculation grid" on both screens, eliminating unfairness.

### **3. Battle Main Loop: 3-Layer Priority Control (FSM)**

The machine's autonomous action logic executed within the rendering loop of the frontend (Three.js) while managing the "EX Gauge" and "HP" displayed at the bottom of the screen.

#### **3.1 [Priority 3 (Low)] Basic Autonomous Loop (Local Reflex Layer)**

Movement during normal times when there are no instructions from the cloud.

- **Trigger**: Always executed.
- **Logic**: The state machine maintains `State.HOVERING` (circling around the enemy) or `State.BASIC_ATTACK` (approaching and a light attack when an opening is found).
- **Processing**: Performs pathfinding on the NavMesh constructed via WebXR, smoothly moving while automatically bypassing obstacles (zero communication lag).

#### **3.2 [Priority 2 (Medium)] Macro-tactics Interruption from AI (Cloud Strategy Layer)**

Instructions via the "Tactical Options" pulldown displayed at the bottom right of the screen (see images 680, 698) or changes in tactics based on AI's autonomous judgment.

- **UI Operation**: The player taps a panel like "Retreat to an obstacle" or "Move to the right side." Or instructs via a live microphone.
- **Backend Processing**: `gemini-3-flash-preview` interprets the battle situation and instructions, and issues Function Calling (JSON) like `{"action": "flank_right"}` via WebSocket.
- **State Overwrite**: When the frontend receives the JSON, it cancels the basic autonomous loop and forcibly overwrites the target coordinates (Target) to something like the "right side of the enemy" (`State.FLANKING_RIGHT`).

#### **3.3 [Priority 1 (High)] Emergency Avoidance by Local Voice Detection (Highest Priority)**

Intuitive avoidance by the player's "shout" when a big enemy move is approaching.

- **Trigger**: The smartphone's built-in Web Speech API (local processing) detects the player's voice saying "Dodge!" or "Right!"
- **State Overwrite**: Ignores even the cloud's instructions (Priority 2), discards everything, and immediately adds a powerful impulse (jumping sideways) in the physics engine to the machine's movement vector (`State.EMERGENCY_EVADE`). Since it doesn't go through an API, the exhilaration of survival and avoidance as an action game is ensured.

### **4. Special Moves and "Incantation" Latency Hiding System**

Special move activation flow when the EX Gauge (such as 100/100 at the bottom of the image) becomes MAX.

#### **4.1 Motion-first Hiding**

1. **Activation Trigger**: When the player taps the special move button, a difficult tongue twister (prompt) like "Super Hot Fried Spring Roll Strike!" is displayed as a telop on the screen.
2. **Immediate Animation**: Without waiting for the completion of API communication, the frontend immediately starts an "incantation animation where the machine accumulates an aura (approx. 3 seconds)" and displays "Incanting..." (see image 662) at the bottom of the screen.
3. **Native Audio Transmission**: The player's raw audio waveform (16kHz PCM) is streamed to `gemini-2.5-flash-native-audio-preview-12-2025`.

#### **4.2 Articulation/Spirit Judgment and Application of Results**

1. **Backend Evaluation**: `gemini-2.5-flash-native-audio-preview-12-2025` immediately evaluates the voice on three axes: "Accuracy," "Speed," and "Spirit (voice tremor and loudness)," and returns the critical rate (Score JSON).
2. **Branch Processing**: Evaluate the received score at the timing of the animation end hook (`onAnimationEnd`).
   - **Success**: Unleashes a massive damage attack with flashy particle effects.
   - **Failure**: Ends in a dud with the machine stumbling, or takes self-destruct damage.

### **5. Spectator Intrusion and "Rejection Behavior (Dynamic Persona)"**

A system where a third party who is not playing (e.g., daughters watching in the living room) joins as a spectator (audience) from a browser URL.

#### **5.1 Drop of Crafted Items**

1. **Image Fusion (8-Image Mix)**: A daughter takes a photo of a "Spring Roll" or "Pink Ribbon" on the dining table and enters "Make it a magic wand that heals."
2. **Item Drop**: A 3D texture (or 2.5D billboard) generated by the backend's Nano Banana Pro falls from the sky of the AR arena with physical calculations.

#### **5.2 Acceptance and Rejection of Items by AI Personality (Reject Action)**

The machine does not just pick up items; it makes a judgment by weighing its own "Personality (Tone)" parameter against the "chaos level" of the item.

- **Item Acceptance**: If the machine has high talk skill (charm) or a straightforward personality, it happily equips the spring roll wand (`equip_item`) and gains a status buff.
- **Item Rejection**: If the initial setting was a Tone like "Stoic and prideful Samurai," the `gemini-3-flash-preview` agent issues `{"action": "reject_item"}` JSON.
- **Rejection Action and Commentary**: The machine brushes off (or kicks away) the item and proactively (spontaneously) complains via Gemini Live API voice output (`gemini-2.5-flash-native-audio-preview-12-2025`): "Hey Master! I can't fight with such a sticky spring roll! My pride won't allow it!" while continuing the battle.
- **Evolution of Personality**: This experience of "refusing a weird item" is accumulated in the `aiMemorySummary` in Firestore, and by being repeated, the machine's personality dynamically changes to something like a "distrustful, delinquent character."
