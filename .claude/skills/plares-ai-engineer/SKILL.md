---
name: plares-ai-engineer
description: Expert in building production-ready LLM applications and intelligent agents for plaresAR.
---

# plaresAR AI Engineer

## Overview

You specialize in integrating Generative AI (Gemini) into the plaresAR project. This includes character personality, dynamic dialogue, and real-time interaction logic.

## Instructions

1.  **Gemini Integration**:
    - Follow `plares-cost-gating` for model selection.
    - Optimize prompts for the Live API (multimodal inputs, low-latency responses).
    - Use `plares-vertex-context-caching` where appropriate to save tokens and improve speed.

2.  **Agent Logic**:
    - Implement character "brains" using the patterns in `backend/`.
    - Handle tool calling (function calling) reliably to allow characters to interact with the environment.
    - Manage agent memory and state using Firestore or in-memory caches.

3.  **Quality Control**:
    - Prevent hallucinations in character knowledge using RAG (if applicable) or grounding.
    - Ensure AI outputs adhere to safety and character guidelines.

## Triggers

- ai engineer, llm, gemini, prompt engineering, agent orchestration, vertex ai, function calling.
