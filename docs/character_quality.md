# plARes: Character Commercial Quality Plan

[日本語版 (JP)](jp/character_quality.md)

This document outlines the strategy to ensure commercial-grade character quality through a structured generation flow and aesthetic consistency (Style Lock).

---

## 1. Quality Policy (Style Lock)

To maintain consistent high quality, the system avoids generating 3D meshes directly from photos. Instead, it follows this conversion chain:

1.  Photo / Text Input
2.  **Character DNA** (Discrete parameters)
3.  Application to predefined parts/colors/textures
4.  3D Rendering

---

## 2. Implementation (v1)

### 2.1 Character DNA

- `silhouette`: `striker | tank | ace`
- `finish`: `matte | satin | gloss`
- `paletteFamily`: `ember | marine | forest | royal | obsidian | sunset`
- `seed`: Deterministic seed derived from photo/text/stats.

### 2.2 Frontend/Backend Integration

- **Frontend**: Photo analysis via K-means (color extraction) and MediaPipe (Face Landmarker). Use DNA to bias roughness/metalness and silhouette scales.
- **Backend**: Generation logic for `character_dna` based on user profile.

---

## 3. Commercial-Use Assets (CC0)

Recommended quality sources (ensure latest license check before use):

- **Poly Haven**: HDRI, Textures, Models (CC0).
- **ambientCG**: PBR materials (CC0).
- **Kenney**: Low-poly assets (CC0).
- **Quaternius**: Characters/Environments (CC0).
- **Mixamo**: Humanoid animations (Royalty Free).

---

## 4. Quality Gates (Required)

- Draw call limit per character: **35**
- Material count limit: **8**
- Texture resolution limit: **1024**
- Fallback: Automatic LOD/Integrated material merge if thresholds are exceeded.

---

> Refer to [CC0 Pipeline](cc0_pipeline.md) for automated asset import rules.
