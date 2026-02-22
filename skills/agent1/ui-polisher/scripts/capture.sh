#!/usr/bin/env bash
# =============================================================================
# UI Polisher - Screenshot Capture Script
# skills/agent1/ui-polisher/scripts/capture.sh
#
# Usage:
#   bash capture.sh [URL] [OUTPUT_DIR]
#   bash capture.sh http://localhost:5173 /tmp/ui-captures
# =============================================================================

set -e

URL="${1:-http://localhost:5173}"
OUTPUT_DIR="${2:-/tmp/ui-captures}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$OUTPUT_DIR"

echo "📸 UI Polisher: Capturing screenshots from $URL"

# ── Mobile (iPhone 15 Pro) ──────────────────────────────────────────────────
npx --yes playwright screenshot \
  --browser chromium \
  --viewport-size "393,852" \
  "$URL" \
  "$OUTPUT_DIR/mobile_${TIMESTAMP}.png"

echo "  ✅ Mobile (393x852): $OUTPUT_DIR/mobile_${TIMESTAMP}.png"

# ── Tablet (iPad Air) ───────────────────────────────────────────────────────
npx playwright screenshot \
  --browser chromium \
  --viewport-size "820,1180" \
  "$URL" \
  "$OUTPUT_DIR/tablet_${TIMESTAMP}.png"

echo "  ✅ Tablet (820x1180): $OUTPUT_DIR/tablet_${TIMESTAMP}.png"

# ── Desktop (1440p) ─────────────────────────────────────────────────────────
npx playwright screenshot \
  --browser chromium \
  --viewport-size "1440,900" \
  "$URL" \
  "$OUTPUT_DIR/desktop_${TIMESTAMP}.png"

echo "  ✅ Desktop (1440x900): $OUTPUT_DIR/desktop_${TIMESTAMP}.png"

echo ""
echo "📂 All captures saved to: $OUTPUT_DIR"
echo "🔑 Timestamp key: $TIMESTAMP"
echo ""
echo "Next step: Pass these images to Gemini with the Design Critique prompt in SKILL.md"
