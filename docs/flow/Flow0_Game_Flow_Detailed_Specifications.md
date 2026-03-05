# **plARes: Game Flow Detailed Specifications**

[日本語版 (JP)](jp/Flow0_プラレスAR_ゲームフロー詳細仕様書.md)

This specification defines the core game cycle for "plARes," an AI agent-driven AR game that merges real-world space (WebXR) with approved Gemini models (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-flash-native-audio-preview-12-2025`, and `gemini-3.1-flash-image-preview`), divided into four phases.

## **Phase 1: Onboarding (Birth of the Machine and Pilot Contract)**

This phase involves more than just avatar creation; it generates a "one-of-a-kind AI partner" that reflects the player's personality and summons it into real space.

### **1.1 Initialization of Hybrid Multilingual UI**

- **Flow**: Upon app startup, the browser's `navigator.language` is read to automatically set the UI language.
- **System**: Static menu items ("Settings," "Start Match," etc.) are rendered using a local JSON dictionary. Subsequent AI commentary and generated subtitles are dynamically rendered from the backend (Server-Driven UI) based on this language setting.

### **1.2 Multimodal Generation of the Machine**

- **Camera Scan**: The player scans their face and expressions using the front camera. `gemini-3.1-pro-preview`'s Vision model analyzes the "aura and skeletal structure" to determine initial status (Power, Speed, etc.) and the main color.
- **Fallback**: If the face scan is skipped, generation via text prompts (e.g., "A passionate, speed-oriented robot") is accepted.
- **Determination of Initial Personality**: From the dialogue and analysis at this point, initial software parameters such as `tone` (manner of speech/personality, e.g., "Sincere Samurai") and `talkSkill` (charm) are determined and saved in Firestore.

### **1.3 First Summoning and Spatial Recognition (WebXR)**

- **Flow**: The player points the smartphone camera at a real table, floor, or even a handmade wooden craft.
- **System**: The space is 3D meshed using WebXR's Hit Test API and Depth Sensing API, and the machine is displayed in AR on a flat surface. Here, the "Live connection" between the machine and the player begins for the first time, and greetings are exchanged via voice.

## **Phase 2: Daily Co-creation (Stroll/Training Mode)**

In this phase, "memory (context)" and "affection" for the AI agent are nurtured through everyday communication outside of battles.

### **2.1 Stroll Mode (Outings and Exploration)**

- **Autonomous Movement**: The machine autonomously walks around the acquired spatial mesh (NavMesh), avoiding or climbing obstacles (local processing with zero communication lag).
- **Vision Integration and Proactive Dialogue**: The smartphone's rear camera footage is streamed to the Gemini Live API (`gemini-2.5-flash-native-audio-preview-12-2025`) at 1-2 frames per second. The AI monitors the footage; for example, if it recognizes "handmade wooden furniture," it spontaneously starts commentary and dialogue (Proactive Audio), saying things like, "Master, this wood smells great!"
- **Real-World Fusion Craft**: During a stroll, the player takes a photo of a real-world object (e.g., "Fried Spring Roll" on a dining table) and sends it with text like "A holy sword that fires lasers." The backend's Nano Banana Pro (`gemini-3.1-flash-image-preview`) performs image fusion (8-Image Mix), generating a "3D weapon texture with the texture of a spring roll" in 1-2 seconds, which is then saved to the inventory.

### **2.2 Training Mode (Incantation Special Training)**

- **Flow**: A mini-game to improve the accuracy of "incantations (tongue twisters)" for special moves while avoiding oncoming obstacles.
- **Articulation Judgment Agent**: `gemini-2.5-flash-native-audio-preview-12-2025` directly analyzes the player's raw audio waveform (Native Audio) and scores it on three axes: "Accuracy" of the text, "Speed" of completion, and "Spirit" (loudness, tremor of the voice, etc.). The higher this score, the higher the "Sync Rate" with the machine.

## **Phase 3: Battle (AR Multiplayer Match)**

The main content where you trust the machine you've nurtured and fight together as a second, giving instructions.

### **3.1 Synchronization of AR Space and Hologram Superimposition**

- **Flow**: The host and guest (opponent) are matched.
- **System**: Terrain data (3D mesh of obstacles) from the host side (e.g., Osaka living room) is sent to the guest side. On the guest's screen, the host side's obstacles are superimposed as "semi-transparent holograms." This builds a fair battle arena even under different physical environments.

### **3.2 Autonomous Combat with 3-Layer Priority Control**

During a match, the machine blends player instructions with autonomous thinking using the following three-layer Finite State Machine (FSM):

1. **[Low Priority] Reflex Layer (Local Calculation)**: Autonomous movement with zero communication lag along the WebXR NavMesh, such as circling the enemy or approaching when an opening is found.
2. **[Medium Priority] Strategy Layer (Cloud AI)**: Every few seconds, the AI analyzes the battle situation and determines macro-policies (Function Calling) like "Circle to the right" or "Hide behind that obstacle," overwriting the machine's state.
3. **[High Priority] Tactical Layer (Player Interrupt)**: The moment a player taps the UI or yells "Dodge!" via voice (Web Speech API), all cloud judgments are canceled, and an emergency evade is performed by adding a physical impulse (Latency Hiding).

### **3.3 Spectator Intervention and "Rejection Behavior"**

- **Item Drop**: Spectators (e.g., the player's daughters) join via a web browser from another smartphone and drop strange items made with Real-World Fusion Craft (e.g., a chainsaw with a pink ribbon) into the AR arena.
- **Judgment based on Machine Personality**: If the machine's AI personality is "stoic and prideful," it may refuse to pick it up (issuing a `reject_item` function) and execute a motion of kicking it away while complaining, "I can't fight with such a ridiculous weapon!"

## **Phase 4: Growth and Evolution (Memory Bank Integration)**

A feedback phase that carves battle results into the machine not just as numerical increases or decreases, but as "memories" and "changes in appearance."

### **4.1 Summarization and Fixation of Memories (Memory Bank)**

- **Flow**: At the end of a match, the backend passes all action logs during the match (in-memory) to `gemini-3.1-pro-preview` to summarize the highlights.
- **System**: Contextual metadata like "Won with the Spring Roll Sword" or "Successfully avoided many times" is merged into and updated in the long-term memory document (aiMemorySummary) in Firestore.

### **4.2 Procedural Texture Evolution**

- **Visual Feedback**: At specific milestones, such as completing a certain number of matches, Nano Banana Pro (`gemini-3.1-flash-image-preview`) batch processing runs in the background. Based on past memories (aiMemorySummary), battle history like "black scorch marks from a fierce fire attack" is dynamically synthesized (overwritten) onto the machine's current texture.

### **4.3 Ambient Growth Feedback**

- **Integration into Daily Life**: Later, while walking in a calm landscape (e.g., a park at sunset) in "Stroll Mode," the AI autonomously searches past memories via MCP (Model Context Protocol).
- **Utterance Example**: Emotional dialogue that makes you feel growth occurs spontaneously, such as, "...By the way, during that fierce battle a month ago, Master, you were so panicked you almost tripped. ...I wonder if we've gotten a bit stronger."
