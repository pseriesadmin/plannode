#!/usr/bin/env bash
# Plannode 정적 앱 로컬 미리보기 (http://localhost:PORT)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT="${1:-8000}"
echo "Plannode → http://localhost:${PORT}  (중지: Ctrl+C)"
exec python3 -m http.server "$PORT"
