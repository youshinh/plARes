#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_E2E=false
if [[ "${1:-}" == "--skip-e2e" ]]; then
  SKIP_E2E=true
fi

echo "[phase1-smoke] backend contract tests"
PYTHONPATH=backend backend/venv/bin/python -m pytest \
  backend/tests/test_ws_router.py \
  backend/tests/test_genai_request_service.py \
  backend/tests/test_audio_judge_service.py \
  backend/tests/test_game_application.py \
  backend/tests/test_message_contracts.py \
  -q

echo "[phase1-smoke] backend compile"
python3 -m py_compile backend/ai_core/main.py

echo "[phase1-smoke] frontend build"
(cd frontend && npm run build)

if [[ "$SKIP_E2E" == "false" ]]; then
  echo "[phase1-smoke] browser e2e"
  "$ROOT_DIR/scripts/e2e_live_smoke.sh"
else
  echo "[phase1-smoke] browser e2e skipped"
fi

cat <<'MANUAL'
[phase1-smoke] remaining manual checks
- Android Chrome: mic allow / deny
- iOS Safari: AudioContext gesture restriction
- Camera deny -> skip/upload recovery
- AR unsupported route clarity
- WebSocket reconnect after unstable network
- ADK unavailable degraded reason visibility
MANUAL
