# plARes: Game System Supplement

[日本語版 (JP)](jp/game_supplement.md)

This document complements the existing design documents with specific implementation constants and newly defined logic.

---

## 1. Material Triangle Logic

| Material  | Theme         | Strong (1.3x) | Weak (0.8x) |
| --------- | ------------- | ------------- | ----------- |
| **Wood**  | Nature/Absorb | Resin         | Metal       |
| **Metal** | Heavy/Power   | Wood          | Resin       |
| **Resin** | Light/Agile   | Metal         | Wood        |

**Relationship**: Metal > Wood > Resin > Metal.

---

## 2. EX Gauge Specifications

- **MAX**: 100
- **Accumulation**:
  - `ON_HIT_DEALT`: +8 (Critical +16)
  - `ON_HIT_RECEIVED`: +12
  - `PER_SECOND`: +1
- **Flow**: MAX -> Backend Sends `special_ready` -> UI appears -> Player voice triggers `CASTING_SPECIAL`.

---

## 3. Communication Tech (Final)

| Path           | Protocol            | Use Case                   |
| -------------- | ------------------- | -------------------------- |
| Coordinates    | WebRTC Data Channel | P2P Low Latency (10-30ms)  |
| AI Voice/Video | WebRTC Stream       | Gemini Multimodal Live API |
| Game Events    | WebSocket (TCP)     | JSON Sync                  |
| Init Stats     | Firestore REST      | Initial Matchup Only       |
| Signaling      | Firebase RTDB       | P2P Handshake              |

---

## 4. HP & Damage Formulas

- **Max HP**: `100 + vit * 2`
- **Base Damage**: `10 + attackerPower * 0.3`
- **Multipliers**: Applied based on the material triangle (x1.3, x1.0, x0.8).

---

> Refer to [Master Design](master_design.md) for the high-level roadmap.
