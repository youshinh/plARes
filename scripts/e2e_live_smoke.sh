#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"
export PLAYWRIGHT_CLI_SESSION="${PLAYWRIGHT_CLI_SESSION:-pls$$}"
export E2E_RUN_ID="${E2E_RUN_ID:-e2e$(date +%s)}"
export E2E_PLAYER_ID="${E2E_PLAYER_ID:-${E2E_RUN_ID}_player}"
export E2E_ROOM_ID="${E2E_ROOM_ID:-${E2E_RUN_ID}_room}"
export E2E_BACKEND_PORT="${E2E_BACKEND_PORT:-$((18000 + (RANDOM % 1000)))}"
export E2E_FRONTEND_PORT="${E2E_FRONTEND_PORT:-$((3000 + (RANDOM % 1000)))}"

ARTIFACT_DIR="$ROOT_DIR/output/playwright/live-smoke"
RUN_LOG="$ARTIFACT_DIR/playwright.log"
BACKEND_LOG="$ARTIFACT_DIR/backend.log"
FRONTEND_LOG="$ARTIFACT_DIR/frontend.log"
RUNTIME_DIR="$ARTIFACT_DIR/runtime"
MATCH_LOG_DIR="$RUNTIME_DIR/match_logs"
USER_RUNTIME_DIR="$RUNTIME_DIR/users"
FRONTEND_URL="http://127.0.0.1:${E2E_FRONTEND_PORT}/"
GAME_WS_URL="ws://127.0.0.1:${E2E_BACKEND_PORT}/ws/game"
AUDIO_WS_URL="ws://127.0.0.1:${E2E_BACKEND_PORT}/ws/audio"

mkdir -p "$ARTIFACT_DIR" "$MATCH_LOG_DIR" "$USER_RUNTIME_DIR"
: >"$RUN_LOG"
: >"$BACKEND_LOG"
: >"$FRONTEND_LOG"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install Node.js/npm first." >&2
  exit 1
fi
if [[ ! -x "$PWCLI" ]]; then
  echo "Playwright wrapper not found or not executable: $PWCLI" >&2
  exit 1
fi
if [[ ! -x "$ROOT_DIR/backend/venv/bin/python" ]]; then
  echo "Backend venv python not found: $ROOT_DIR/backend/venv/bin/python" >&2
  exit 1
fi
if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "frontend/node_modules not found. Run npm install in frontend first." >&2
  exit 1
fi

npx playwright install chromium >/dev/null 2>&1 || true

wait_for_http() {
  local url="$1"
  local timeout="${2:-60}"
  local elapsed=0
  while (( elapsed < timeout )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    ((elapsed+=1))
  done
  echo "Timeout waiting for $url" >&2
  return 1
}

wait_for_port() {
  local port="$1"
  local timeout="${2:-60}"
  local elapsed=0
  while (( elapsed < timeout )); do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    ((elapsed+=1))
  done
  echo "Timeout waiting for port $port" >&2
  return 1
}

cleanup() {
  if command -v "$PWCLI" >/dev/null 2>&1; then
    "$PWCLI" close >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

PLARES_HOST=127.0.0.1 \
PLARES_PORT="$E2E_BACKEND_PORT" \
PLARES_MATCH_LOG_DIR="$MATCH_LOG_DIR" \
PLARES_USER_RUNTIME_DIR="$USER_RUNTIME_DIR" \
"$ROOT_DIR/backend/venv/bin/python" -u "$ROOT_DIR/backend/ai_core/main.py" \
  >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

VITE_PLAYER_ID="$E2E_PLAYER_ID" \
VITE_ROOM_ID="$E2E_ROOM_ID" \
VITE_WS_URL="$GAME_WS_URL" \
VITE_AUDIO_WS_URL="$AUDIO_WS_URL" \
VITE_SKIP_FACE_SCANNER=true \
npm --prefix "$ROOT_DIR/frontend" run dev -- --host 127.0.0.1 --port "$E2E_FRONTEND_PORT" \
  >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

wait_for_port "$E2E_BACKEND_PORT" 60
wait_for_http "$FRONTEND_URL" 60

pw() {
  "$PWCLI" "$@" >>"$RUN_LOG" 2>&1
}

latest_snapshot() {
  ls -t "$ROOT_DIR"/.playwright-cli/page-*.yml 2>/dev/null | sed -n '1p' || true
}

take_snapshot() {
  pw snapshot
  latest_snapshot
}

extract_ref() {
  local label="$1"
  local snapshot="$2"
  grep -m 1 -o "button \"$label\" \[.*ref=e[0-9]*\]" "$snapshot" 2>/dev/null | sed -n 's/.*ref=\(e[0-9]*\)\]/\1/p' || true
}

click_button_if_present() {
  local label="$1"
  local snapshot="$2"
  local ref
  ref="$(extract_ref "$label" "$snapshot")"
  if [[ -n "$ref" ]]; then
    pw click "$ref"
    return 0
  fi
  return 1
}

pw open "$FRONTEND_URL"
SNAPSHOT="$(take_snapshot)"
if [[ -z "${SNAPSHOT:-}" ]]; then
  echo "E2E failed: initial snapshot unavailable" >&2
  exit 1
fi

TOKEN_OK=false
for _ in $(seq 1 20); do
  if grep -q 'Token: auth_tokens/' "$SNAPSHOT" 2>/dev/null; then
    TOKEN_OK=true
    break
  fi
  click_button_if_present "ISSUE LIVE TOKEN" "$SNAPSHOT" || true
  sleep 2
  SNAPSHOT="$(take_snapshot)"
done

if [[ "$TOKEN_OK" != "true" ]]; then
  echo "E2E failed: token response not reflected in UI" >&2
  echo "See logs:" >&2
  echo "  $RUN_LOG" >&2
  echo "  $BACKEND_LOG" >&2
  echo "  $FRONTEND_LOG" >&2
  exit 1
fi

LIVE_OK=false
for _ in $(seq 1 25); do
  if grep -q 'button "DISCONNECT LIVE"' "$SNAPSHOT" 2>/dev/null; then
    LIVE_OK=true
    break
  fi
  click_button_if_present "CONNECT LIVE" "$SNAPSHOT" || true
  sleep 2
  SNAPSHOT="$(take_snapshot)"
done

if [[ "$LIVE_OK" != "true" ]]; then
  echo "E2E failed: DISCONNECT LIVE state not found" >&2
  echo "See logs:" >&2
  echo "  $RUN_LOG" >&2
  echo "  $BACKEND_LOG" >&2
  echo "  $FRONTEND_LOG" >&2
  exit 1
fi

echo "E2E live smoke test passed."
echo "Artifacts:"
echo "  $RUN_LOG"
echo "  $BACKEND_LOG"
echo "  $FRONTEND_LOG"
echo "  $RUNTIME_DIR"
echo "  $SNAPSHOT"
