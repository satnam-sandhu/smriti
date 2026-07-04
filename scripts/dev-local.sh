#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f mcp/.env ]; then
  cp mcp/.env.example mcp/.env
  echo "Created mcp/.env from example"
fi

# Pin local MCP workspace to smriti/data (shared with Tauri desktop app)
mkdir -p "$ROOT/data/bronze" "$ROOT/data/silver" "$ROOT/data/quarantine"
mkdir -p "$ROOT/data/gold/domain=finance/year=2026/month=07"
export SMRITI_ROOT="$ROOT"
export SMRITI_WORKSPACE="$ROOT/data"

if [ ! -f nitrochat/.env.local ]; then
  cp nitrochat/.env.smriti.example nitrochat/.env.local
  echo "Created nitrochat/.env.local — add NITROCHAT_GATEWAY_API_KEY"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — add OPENROUTER_API_KEY if using parser LLM"
fi

if [ -z "$(grep -E '^NITROCHAT_GATEWAY_API_KEY=.+' nitrochat/.env.local 2>/dev/null || true)" ]; then
  echo "WARNING: Set NITROCHAT_GATEWAY_API_KEY in nitrochat/.env.local for LLM chat"
fi

echo "Starting local MCP (:3000) + NitroChat (:3003)…"
echo "Run 'npm run dev' in another terminal for the Smriti desktop app."
echo ""

trap 'kill 0' INT TERM EXIT

npm run dev:mcp:http &
MCP_PID=$!
sleep 2
npm run dev:nitrochat &
CHAT_PID=$!

wait "$MCP_PID" "$CHAT_PID"
