import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GOLD_GLOB, GOLD_PARTITION } from './constants.js';

const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url));
/** `mcp/` package root — stable anchor for monorepo path resolution. */
const MCP_DIR = resolve(BRIDGE_DIR, '../..');

function resolveSmritiRoot(): string {
  if (process.env.SMRITI_ROOT) {
    const root = process.env.SMRITI_ROOT.trim();
    return root.startsWith('/') ? resolve(root) : resolve(MCP_DIR, root);
  }
  const candidates = [
    resolve(MCP_DIR, '..'),
    resolve(BRIDGE_DIR, '../../..'),
    resolve(BRIDGE_DIR, '../..'),
    resolve(process.cwd()),
    resolve(process.cwd(), '..'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'parser/mcp_bridge.py'))) return c;
  }
  return resolve(MCP_DIR, '..');
}

export const SMRITI_ROOT = resolveSmritiRoot();

function resolveWorkspace(): string {
  if (process.env.SMRITI_WORKSPACE) {
    const ws = process.env.SMRITI_WORKSPACE.trim();
    if (ws.startsWith('/')) return resolve(ws);
    // Legacy mcp/.env used ../data relative to mcp/
    if (ws.startsWith('..')) return resolve(MCP_DIR, ws);
    return resolve(SMRITI_ROOT, ws);
  }
  return join(SMRITI_ROOT, 'data');
}

export const WORKSPACE = resolveWorkspace();

export function bronzeDir() {
  return join(WORKSPACE, 'bronze');
}

export function silverDir() {
  return join(WORKSPACE, 'silver');
}

export function goldGlob() {
  return join(WORKSPACE, GOLD_GLOB);
}

export function quarantineDir() {
  return join(WORKSPACE, 'quarantine');
}

export function pluginPath() {
  return join(WORKSPACE, 'plugin.json');
}

export function metricsPath() {
  return join(WORKSPACE, 'metrics.json');
}

export function registryPath() {
  return join(SMRITI_ROOT, 'parser/registry.db');
}

export function ensureWorkspaceDirs() {
  mkdirSync(bronzeDir(), { recursive: true });
  mkdirSync(silverDir(), { recursive: true });
  mkdirSync(join(WORKSPACE, GOLD_PARTITION), { recursive: true });
  mkdirSync(quarantineDir(), { recursive: true });
}

export function resolvePython(): string | null {
  const candidates = [
    process.env.SMRITI_PYTHON,
    join(SMRITI_ROOT, 'parser/.venv/bin/python3'),
    join(SMRITI_ROOT, 'parser/.venv/bin/python'),
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    'python',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    if (bin.includes('/')) {
      if (existsSync(bin)) return bin;
      continue;
    }
    const found = spawnSync('which', [bin], { encoding: 'utf-8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}

export const SUPPORTED_EXTENSIONS = new Set([
  '.txt',
  '.pdf',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.tiff',
]);

export function supportedExtension(name: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase());
}
