# plARes: Game Feature Expansion

[日本語版 (JP)](jp/game_expansion.md)

This document outlines expanded features including Training, Walking, and Dynamic Evolution.

---

## 1. Training Mode (Solo)

Focuses on player reflexes and robot `syncRate`.

- **Flow**: Avoid logs/plates in AR -> Local Speech recognition dodge -> Boss encounter streams voice to Gemini -> Pronunciation score updates `syncRate` in Firestore.

---

## 2. Walk Mode (Exploration)

AI interacts with the real-world environment.

- **Vision**: Bidi-streaming (1-2fps) camera to Gemini Live API.
- **Interaction**: AI recognizes benches ("Nice wood, Master!") or darkness (triggers `glow_eyes`).
- **Crafting**: Real-world scans generate textures for future equipment.

---

## 3. Dynamic Visual Evolution

1.  **Bone Scaling**: level/stats growth changes bone size (e.g., thicker arms for high power) via `bone.scale.set()`.
2.  **Procedural Textures**: Every 10 matches, battle history generates new textures (scars, burns) using Gemini Image Fusion.
3.  **Real-time Crafting**: Attaching 3D-scanned items to हाथ bones.

---

## 4. Spectator Interaction

- **talkSkill**: Determines how often helpful items spawn from spectators.
- **Persona Shift**: Spectators can request a personality change (e.g., "Speak like an aggressive mom") via WebSocket.
- **Reject Item**: AI can refuse "chaotic" items if they clash with its personality.

---

## 5. Victory Interviews

AI generates a victory massage in the **opponent's native language** using battle highlights and personality tone.

---

> Refer to [Master Design](master_design.md) for the roadmap.
