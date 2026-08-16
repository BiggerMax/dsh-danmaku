#!/bin/bash
# Build: compile src/ → lib/ with the project-local typescript + tsdown.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Installing dev dependencies ==="
npm install --save-dev 2>&1 | tail -5

echo "=== Compiling host (src/index.ts → lib/index.js) ==="
npx tsc -p tsconfig.json
echo "=== Host build complete ==="

echo "=== Building client (tsdown → lib/client.js) ==="
npx tsdown
echo "=== Client build complete ==="

echo "=== Build complete ==="