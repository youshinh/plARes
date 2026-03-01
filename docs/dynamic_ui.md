# plARes: Multilingual Support & Dynamic UI (SDUI)

[日本語版 (JP)](jp/dynamic_ui.md)

This document defines the hybrid architecture using language-agnostic JSON communication and **Server-Driven UI (SDUI)** to eliminate static localization files and hard-coded UI.

---

## 1. Hybrid Localization Foundation

- **Web Speech API Standard**: Language selection is based on the browser's native Web Speech API (BCP-47) to ensure local zero-latency voice recognition.
- **Metadata Persistence**: User language settings (e.g., `ja-JP`) are passed to the Gemini session context for consistent downstream output.

---

## 2. Server-Driven UI (SDUI)

UI elements are not hard-coded but rendered dynamically based on AI-generated JSON.

### 2.1 Tactical Panels

Between rounds, Gemini analyzes battle logs and generates localized tactical options (e.g., "Hold guard and wait for a gap") as a JSON array, which the frontend maps to interactive buttons.

### 2.2 Global Special Moves

AI generates tongue-twisters tailored to the player's native language (e.g., an English-speaking player gets an English tongue-twister, while a Japanese player gets a Japanese one).

---

## 3. Language-Agnostic Event Sync

- **Protocol**: Battle events are strictly language-agnostic JSON (e.g., `{"event": "critical_hit"}`).
- **Translator Agent**: A specialized agent on the client screen interprets this JSON and generates localized commentary/subtitles (e.g., "Boom! A massive hit!" for US, "強烈な一撃！" for JP).

---

## 4. Emotional Victory Interviews

The most advanced multilingual feature:

1.  **Pipeline**: Winner's AI uses metadata of the loser's language setting.
2.  **Output**: Generates a victory message _in the loser's native language_ while maintaining the AI winner's personality.
3.  **Result**: An American robot says, "HAHAHA! Your voice was good, but that 'Kagebunshin' was a joke!" in fluent Japanese to a defeated Japanese player.

---

> Refer to [Multiplayer Sync](multiplayer_sync.md) for event protocol details.
