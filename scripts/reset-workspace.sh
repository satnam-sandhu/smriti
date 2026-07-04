#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="${SMRITI_WORKSPACE:-$ROOT/data}"

echo "==> Resetting Smriti workspace: $WORKSPACE"

if [[ -d "$WORKSPACE" ]]; then
  rm -rf "$WORKSPACE"
fi

mkdir -p \
  "$WORKSPACE/bronze" \
  "$WORKSPACE/silver" \
  "$WORKSPACE/gold/collections" \
  "$WORKSPACE/gold/domain=finance/year=2026/month=07" \
  "$WORKSPACE/quarantine"

REGISTRY="$ROOT/parser/registry.db"
if [[ -f "$REGISTRY" ]]; then
  rm -f "$REGISTRY"
  echo "==> Removed parser registry"
fi

UPLOADS="$ROOT/mcp/uploads"
if [[ -d "$UPLOADS" ]]; then
  rm -rf "$UPLOADS"/*
  echo "==> Cleared MCP uploads"
fi

APP_DATA="$HOME/Library/Application Support/com.smriti.ingestion/smriti-workspace"
if [[ -d "$APP_DATA" ]]; then
  rm -rf "$APP_DATA"
  echo "==> Cleared Tauri app-data workspace"
fi

echo "==> Workspace reset complete"
echo "    Restart the Smriti app for a fresh first-run experience."
