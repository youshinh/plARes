#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="${PWCLI:-$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh}"
export PLAYWRIGHT_CLI_SESSION="${PLAYWRIGHT_CLI_SESSION:-pls$$}"

ARTIFACT_DIR="$ROOT_DIR/output/playwright/live-smoke"
RUN_LOG="$ARTIFACT_DIR/playwright.log"
BACKEND_LOG="$ARTIFACT_DIR/backend.log"
FRONTEND_LOG="$ARTIFACT_DIR/frontend.log"

mkdir -p "$ARTIFACT_DIR"
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
  local host="$1"
  local port="$2"
  local timeout="${3:-60}"
  local elapsed=0
  while (( elapsed < timeout )); do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | rg -q "$host:$port|\\*:$port"; then
      return 0
    fi
    sleep 1
    ((elapsed+=1))
  done
  echo "Timeout waiting for $host:$port" >&2
  return 1
}

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

PLARES_HOST=127.0.0.1 "$ROOT_DIR/backend/venv/bin/python" "$ROOT_DIR/backend/ai_core/main.py" \
  >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

npm --prefix "$ROOT_DIR/frontend" run dev -- --host 127.0.0.1 --port 3000 \
  >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

wait_for_http "http://127.0.0.1:3000/"
wait_for_port "127.0.0.1" "8000"

pw() {
  "$PWCLI" "$@" >>"$RUN_LOG" 2>&1
}

latest_snapshot() {
  ls -t "$ROOT_DIR"/.playwright-cli/page-*.yml 2>/dev/null | head -n1
}

extract_ref() {
  local label="$1"
  local snapshot="$2"
  rg -o "button \"$label\" \\[.*ref=(e[0-9]+)\\]" -r '$1' "$snapshot" | head -n1
}

pw open "http://127.0.0.1:3000"
pw snapshot

SNAPSHOT_A="$(latest_snapshot)"
ISSUE_REF="$(extract_ref "ISSUE LIVE TOKEN" "$SNAPSHOT_A")"
CONNECT_REF="$(extract_ref "CONNECT LIVE" "$SNAPSHOT_A")"

if [[ -z "${ISSUE_REF:-}" || -z "${CONNECT_REF:-}" ]]; then
  echo "Failed to resolve button refs from $SNAPSHOT_A" >&2
  exit 1
fi

pw click "$ISSUE_REF"
sleep 2
pw click "$CONNECT_REF"
sleep 2
pw snapshot

SNAPSHOT_B="$(latest_snapshot)"
if ! rg -q 'button "DISCONNECT LIVE"' "$SNAPSHOT_B"; then
  echo "E2E failed: DISCONNECT LIVE state not found in $SNAPSHOT_B" >&2
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
echo "  $SNAPSHOT_B"
