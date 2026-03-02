# **plARes: Game Flow Detailed Specifications**

## **Phase 4: Growth and Evolution (Memory Bank Integration)**

[日本語版 (JP)](jp/Flow4_プラレスAR_Phase4_成長と進化詳細仕様書.md)

This specification defines the system flow and implementation requirements of a feedback cycle that accumulates combat and everyday experiences in "plARes" as "data" and dynamically returns them to the machine's visual "appearance (texture)" and internal "mind (memory and utterances)."

### **1. User Experience (UX) Goals**

- **Visualization of Battle History (One-off Affection)**: Automatically generate a "one-of-a-kind well-used machine" where every single scratch has a reason, like a real plastic model or DIY work.
- **Ambient Growth Feeling**: Instead of showing numerical values on a status screen, make the player emotionally realize their own growth and bonds through the "AI's monologue" at a casual moment in daily life.
- **Optimization of Cost and UX**: Prevent cost failure by combining Firestore, MCP, and Context Caching, rather than making the API read all vast memories every time.

### **2. Extraction of Memories and Memory Bank (Data Layer)**

Backend processing that compresses and saves the vast amount of communication data during matches (Phase 3) as permanent "long-term memory."

#### **2.1 Log Extraction from In-Memory (Commit & Summarize)**

1. **Match End Trigger**: The moment a match ends, the backend (Python server) lists hundreds of lines of action logs (movement, hits, audio command waveform evaluation, etc.) held in memory.
2. **Highlight Extraction (Gemini API)**:
   - Pass the logs to Gemini 2.0 Pro and instruct it to "Extract highlights from this match, changes in player's panic or spirit, and impressive events into JSON."
   - _Extraction Example_: `{"key_event": "Desperate struggle in Toyonaka Arena", "player_sentiment": "Panic subsided at the end, recorded spirit score 0.9", "critical_damage": "Concentrated fire on the right arm"}`
3. **Persistence in Firestore**:
   - Add the extracted highlight as a new document to the `users/{userId}/matchLogs` collection.
   - Simultaneously, have Gemini rewrite the `aiMemorySummary` document, the machine's long-term memory summary, and update it once.

### **3. Procedural Texture that Carves Battle History (Visual Evolution)**

A system where the AI generates and overwrites a texture exclusive to that machine as a reward for "leveling up," rather than using a pre-prepared image.

#### **3.1 Firing of Milestone Triggers**

1. A Firestore trigger (Cloud Functions, etc.) detects that the number of matches has reached a specific milestone (e.g., completion of 10 matches, or when the win rate rises sharply).
2. A texture generation task is queued as an asynchronous batch process on the backend.

#### **3.2 Texture Generation via Real-World Fusion (8-Image Mix)**

1. **API Call**: Call the image fusion API of Nano Banana Pro (Gemini 2.0 Flash Image).
2. **Construction of Multimodal Prompt**:
   - **Base Image**: Current machine texture image (e.g., "Beautiful solid wood texture" initially set by the player utilizing knowledge as a lumber manufacturer).
   - **Additional Image**: Images of items dropped by spectators (daughters) in past matches (e.g., image of a "Spring Roll").
   - **Text Prompt**: Generated based on memories extracted from `aiMemorySummary`.
     - _"On the surface of this wooden part, realistically synthesize black scorch marks from receiving a fierce fire attack and fine blade chips from going through many battles. Also, on the right shoulder, carve the 'Spring Roll' from the input image as a stencil-style paint logo as a symbol of victory."_
3. **Dynamic Application (Server-Driven Rendering)**:
   - The new texture URL generated in 1-2 seconds is saved in Firestore.
   - The next time the machine is summoned in AR space, Three.js reads this texture, and the machine seamlessly transforms into a "wooden robot carved with battle scorch marks and a spring roll logo."

### **4. Ambient Growth Feedback (Mental Evolution)**

An emotional UX design where the AI autonomously reflects on the past during a relaxed "Stroll Mode (Phase 2)," not during combat.

#### **4.1 Autonomous Memory Search via MCP (Model Context Protocol)**

1. **Vision-based Environmental Recognition**: During Stroll Mode, the Live API monitors the smartphone camera footage. It detects specific contexts such as a "sunset" or "familiar handmade wooden furniture (DIY work)."
2. **MCP Server Integration**:
   - The AI uses its assigned Managed MCP servers for Firestore permissions to autonomously search its own `aiMemorySummary`.
3. **Binding of Context and Proactive Audio (Spontaneous Utterance)**:
   - The AI links the "current landscape in front of it" with "past memories" and speaks to the player in a quiet tone (`tone: "subtle_reflection"`) via Gemini TTS.
   - _Utterance Example_: "...Master. The grain of this self-made wooden table is beautiful. By the way, back when we fought at Grandpa's house in Toyonaka the other day, you were so panicked that your voice cracked (laughs). ...But at that time, you finally gathered your courage and nailed the incantation. We've become a bit of a good duo, haven't we?"

### **5. Entertainment Expansion of Milestones (Veo / Lyria Integration)**

A massive reward system to increase long-term retention, such as once every few dozen matches.

#### **5.1 Procedural Victory Song (Lyria API)**

- When clearing a large tournament (or a winning streak) with a hard-fought victory, the `Lyria API` is launched asynchronously on the backend.
- Automatically generate a 30-second "slightly comical and hot EDM" that incorporates match highlights (reversal drama with the Spring Roll Sword, etc.) into the lyrics and play it as BGM on the result screen.

#### **5.2 Memorial Video Generation (Veo API)**

- At big milestones such as the completion of 50 matches, the `Veo API` runs.
- Connect recorded data from AR play (several seconds of clip groups) accumulated so far with the AI's memory to generate a high-quality 15-second short movie depicting the "Trajectory of the Machine and the Master." It explosively promotes the player's fan activity (pushing) as a lead-in to SNS (sharing function).
