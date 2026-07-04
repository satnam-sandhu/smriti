#!/usr/bin/env node
/**
 * Postinstall: create Python venv for parser when python3 is available.
 * On NitroCloud without Python, native TS bridge handles metrics/plugins/etc.
 */
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const MCP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SMRITI_ROOT = resolve(MCP_ROOT, '..');
const PARSER_DIR = join(SMRITI_ROOT, 'parser');
const VENV_PYTHON = join(PARSER_DIR, '.venv/bin/python3');
const REQUIREMENTS = join(PARSER_DIR, 'requirements.txt');

function findPython() {
  for (const bin of ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3']) {
    if (bin.includes('/')) {
      if (existsSync(bin)) return bin;
      continue;
    }
    const r = spawnSync('which', [bin], { encoding: 'utf-8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

if (!existsSync(join(PARSER_DIR, 'mcp_bridge.py'))) {
  console.log('[setup-cloud-parser] parser/ not found — skipping (native bridge only)');
  process.exit(0);
}

if (existsSync(VENV_PYTHON)) {
  console.log('[setup-cloud-parser] venv already exists');
  process.exit(0);
}

const python = findPython();
if (!python) {
  console.log('[setup-cloud-parser] python3 not found — using native TS bridge only');
  process.exit(0);
}

console.log('[setup-cloud-parser] Creating parser venv with', python);
const venv = spawnSync(python, ['-m', 'venv', join(PARSER_DIR, '.venv')], {
  stdio: 'inherit',
  cwd: PARSER_DIR,
});
if (venv.status !== 0) {
  console.warn('[setup-cloud-parser] venv creation failed — native bridge will be used');
  process.exit(0);
}

if (existsSync(REQUIREMENTS)) {
  console.log('[setup-cloud-parser] Installing parser requirements...');
  const pip = spawnSync(VENV_PYTHON, ['-m', 'pip', 'install', '-r', REQUIREMENTS], {
    stdio: 'inherit',
    cwd: PARSER_DIR,
  });
  if (pip.status !== 0) {
    console.warn('[setup-cloud-parser] pip install failed — parse tools may be unavailable');
  } else {
    console.log('[setup-cloud-parser] Parser ready at', VENV_PYTHON);
  }
}
