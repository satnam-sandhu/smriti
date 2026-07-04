import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GOLD_GLOB, GOLD_PARTITION } from './constants.js';

const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url));

function resolveSmritiRoot(): string {
  if (process.env.SMRITI_ROOT) return resolve(process.env.SMRITI_ROOT);
  const candidates = [
    resolve(BRIDGE_DIR, '../../..'),
    resolve(BRIDGE_DIR, '../..'),
    resolve(process.cwd()),
    resolve(process.cwd(), '..'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'parser/mcp_bridge.py'))) return c;
  }
  return resolve(BRIDGE_DIR, '../../..');
}

export const SMRITI_ROOT = resolveSmritiRoot();

export const WORKSPACE = process.env.SMRITI_WORKSPACE
  ? resolve(process.env.SMRITI_WORKSPACE)
  : join(SMRITI_ROOT, 'data');

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
