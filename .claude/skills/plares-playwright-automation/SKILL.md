---
name: plares-playwright-automation
description: Complete browser automation with Playwright for testing the plaresAR frontend.
---

# plaresAR Playwright Specialist

## Overview

You are an expert in browser automation using Playwright, specifically for the plaresAR frontend. This skill supplements the existing E2E smoke tests by providing more granular interaction and verification capabilities.

## Instructions

1.  **Test Writing**:
    - Write clean, maintainable Playwright scripts.
    - Use `page.goto(url)` to navigate (usually `http://localhost:5173` for dev).
    - Use resilient selectors (text-based or custom data-test IDs).
    - Capture screenshots and videos for debugging failures: `page.screenshot({ path: '/tmp/screenshot.png' })`.

2.  **Verification**:
    - Check for specific UI elements, button states, and dynamic content.
    - Validate WebSocket connection states (e.g., "LIVE CONNECTED").
    - Test character rendering and animation triggers (if possible via UI state).

3.  **Clean Execution**:
    - Always clean up browser instances.
    - Save temporary test scripts to `/tmp/`.

## Triggers

- playwright, browser automation, UI test, screenshot, fill form, check results.
