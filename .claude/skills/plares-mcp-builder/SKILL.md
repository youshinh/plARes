---
name: mcp-builder
description: Teaches Agent 3 how to build and maintain Model Context Protocol (MCP) servers. Use this skill when integrating external APIs, searching Firestore, or providing new tools to the AI.
license: MIT
metadata:
  author: plares-ar-team
  version: "1.0"
---

# MCP Server Builder

This skill guides the creation of standardized, high-quality MCP servers for Agent 3 to grant Agent 2 autonomous capabilities.

## When to Use This Skill

- When an AI agent needs secure, dynamic read/write access to Firestore without hard-coding the database queries into the application logic.
- When bundling third-party APIs (like a weather service or a custom math engine) into a standardized format.

## Instructions

1. **Define Capabilities**:
   - Determine if the server provides _Resources_ (static data, e.g., the game manual), _Tools_ (executable functions like querying a database), or _Prompts_ (templates).
2. **Firestore Tool Exposing**:
   - Build tools that allow the AI (Agent 2) to securely query past match logs (`matchLogs`) or user stats without knowing the exact database schema.
   - Ensure the MCP server strictly sanitizes inputs to prevent prompt injection or unrestricted DB scans.
3. **Execution Safety**:
   - Ensure tools are idempotent where possible.
   - For destructive actions (e.g., deleting a robot), either avoid exposing them via MCP or implement strict user confirmation loops.

## Examples

### MCP Tool Definition

```json
{
  "name": "get_user_match_history",
  "description": "Retrieves the last N matches for a specific user to understand their past opponents and strategies.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "userId": { "type": "string" },
      "limit": { "type": "integer", "description": "Max 10" }
    },
    "required": ["userId"]
  }
}
```
