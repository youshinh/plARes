# plARes: Multimodal AI & Crafting Expansion

[日本語版 (JP)](jp/multimodal_craft.md)

This document defines the implementation of "Real-world Fusion Crafting" and asynchronous batch generation (Milestone videos/Victory songs) using Gemini and Imagen/Veo.

---

## 1. Real-world Fusion Crafting (Imagen)

Upgrade spectator intervention from simple text to "Photo + Text" fusion, transforming everyday items into 3D weapons or armor.

### 1.1 Process Flow

- **Multimodal Input**: Spectators take a photo (e.g., "Deep-fried spring roll") and add text (e.g., "Legendary holy sword that shoots lasers").
- **Image Fusion**: AI blends the texture/shape of the photo with the text prompt.
- **Dynamic Mapping**: A 3D object with the new texture is dropped into the AR arena within 1-2 seconds.

### 1.2 Physical Scan Mapping

Players can scan unpainted 3D-printed parts or wooden shields and apply "Cyberpunk painting" or other high-quality textures dynamically in AR.

---

## 2. Procedural Texture Evolution

Robot parts accumulate "scars of battle" as procedural textures based on the **Memory Bank**.

- **Analysis**: Gemini analyzes match highlights (e.g., "Sustained heavy burn damage").
- **Generation**: A new texture URL is generated with realistic burn marks and saved to Firestore.
- **Rendering**: Three.js `TextureLoader` updates the material, and custom shaders adjust normal/roughness maps to reflect damage depth.

---

## 3. Event-Driven Batch Generation (Veo/Lyria)

High-cost video and music generation are gated for major milestones.

### 3.1 Procedural Victory Songs (Lyria)

- **Logic**: Triggered only on "WIN." Gemini analyzes the match drama (e.g., "Comeback victory with spring roll sword") to generate a unique EDM/BGM for the victory interview.

### 3.2 Cinematic Highlights (Veo)

- **Batch**: Every 5 matches (`totalMatches % 5 == 0`), the system triggers a background task.
- **Video**: Combines match logs and captured screenshots into a cinematic 9:16 vertical video with AI-commentary subtitles, optimized for TikTok/SNS sharing.

---

> Refer to [Master Design](master_design.md) for the functional overview.
