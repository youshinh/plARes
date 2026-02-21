---
name: vertex-context-caching
description: Guides Agent 3 / Agent 2 in using Vertex AI Context Caching to drastically lower Time To First Token (TTFT).
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# Vertex Context Caching Expert

This skill ensures large system prompts, physics rulebooks, and massive conversation logs don't slow down the AI or cost excess tokens per request.

## When to Use This Skill

- When the static portion of your system prompt exceeds 32k tokens.
- When initializing a new player session where the AI needs to "know" the player's 100-match history immediately.

## Instructions

1. **Startup Loading**:
   - On game server start or user login, package the `aiMemorySummary`, game physics rules, and persona documents into a single chunk.
2. **Cache Creation**:
   - Call the Vertex AI Context Caching API to load this chunk. Set a Time-To-Live (TTL) appropriate for the session length (e.g., 60 minutes).
   - Obtain and store the returned `Cache ID`.
3. **Execution**:
   - Pass the `Cache ID` in subsequent Live API requests or Text Generate requests instead of sending the full text payload. This reduces TTFT and input token costs by up to 70%.

## Examples

### Caching API Request (Python SDK Concept)

```python
# Create a cache
cache = genai.caching.CachedContent.create(
    model="models/gemini-1.5-pro-002",
    system_instruction="You are a Plares AR robot...",
    contents=[massive_game_rulebook, user_history_logs],
    ttl=datetime.timedelta(minutes=60),
)

# Use the cache in a model instance
model = genai.GenerativeModel.from_cached_content(cached_content=cache)
response = model.generate_content("Let's start the match!")
```
