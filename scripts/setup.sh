#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Smriti setup"

# Node dependencies
echo "==> Installing root dependencies..."
npm install

echo "==> Installing MCP dependencies..."
npm install --prefix mcp

# Python parser venv
echo "==> Setting up Python parser..."
python3 -m venv parser/.venv
parser/.venv/bin/pip install -r parser/requirements.txt

# Data directories
echo "==> Creating data directories..."
mkdir -p data/bronze data/silver data/gold/domain=healthcare/year=2026/month=07 data/quarantine
mkdir -p samples/good samples/bad samples/expected

# Env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "==> Created .env from .env.example — add OPENROUTER_API_KEY"
fi

# Rust check (optional, may take time on first run)
if command -v cargo &>/dev/null; then
  echo "==> Checking Tauri/Rust build..."
  source "$HOME/.cargo/env" 2>/dev/null || true
  cd src-tauri && cargo check && cd ..
else
  echo "==> Rust not found — install via https://rustup.rs for Tauri"
fi

echo ""
echo "Setup complete!"
echo ""
echo "  npm run dev          — Start Smriti desktop app"
echo "  npm run dev:mcp      — Start NitroStack MCP server"
echo ""
echo "Team task files: docs/team/"
