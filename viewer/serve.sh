#!/usr/bin/env bash
# Serve the viewer from the repo root so it can fetch ../data/recipes/*.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8000}"
echo "Viewer:  http://localhost:${PORT}/viewer/"
exec python3 -m http.server "$PORT"
