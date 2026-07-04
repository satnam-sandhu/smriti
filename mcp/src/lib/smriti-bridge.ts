import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GOLD_GLOB, GOLD_PARTITION } from './constants.js';

const BRIDGE_DIR = dirname(fileURLToPath(import.meta.url));

export const SMRITI_ROOT = process.env.SMRITI_ROOT
  ? resolve(process.env.SMRITI_ROOT)
  : resolve(BRIDGE_DIR, '../../..');

export const PYTHON = existsSync(join(SMRITI_ROOT, 'parser/.venv/bin/python3'))
  ? join(SMRITI_ROOT, 'parser/.venv/bin/python3')
  : 'python3';

export const WORKSPACE = process.env.SMRITI_WORKSPACE
  ? resolve(process.env.SMRITI_WORKSPACE)
  : join(SMRITI_ROOT, 'data');

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

export function dbPath() {
  return join(WORKSPACE, 'smriti.db');
}

export function pluginPath() {
  return join(WORKSPACE, 'plugin.json');
}

export function metricsPath() {
  return join(WORKSPACE, 'metrics.json');
}

export function ensureWorkspaceDirs() {
  mkdirSync(bronzeDir(), { recursive: true });
  mkdirSync(silverDir(), { recursive: true });
  mkdirSync(join(WORKSPACE, GOLD_PARTITION), { recursive: true });
  mkdirSync(quarantineDir(), { recursive: true });
}

function bridgeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMRITI_ROOT,
    SMRITI_WORKSPACE: WORKSPACE,
    PYTHONPATH: join(SMRITI_ROOT, 'parser'),
  };
}

export function runMcpBridge(command: string, args: string[] = []): unknown {
  const output = execFileSync(
    PYTHON,
    [join(SMRITI_ROOT, 'parser/mcp_bridge.py'), command, ...args],
    { encoding: 'utf-8', cwd: SMRITI_ROOT, env: bridgeEnv() },
  );
  return JSON.parse(output.trim());
}

export interface ParserResult {
  parserPath: 'ai' | 'deterministic';
  silverJson: Record<string, unknown>;
  accuracyPct?: number | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}

export function runParser(
  filePath: string,
  expectedPath?: string,
): ParserResult {
  const args = ['--file', filePath];
  if (expectedPath && existsSync(expectedPath)) {
    args.push('--expected', expectedPath);
  }
  const output = execFileSync(
    PYTHON,
    [join(SMRITI_ROOT, 'parser/cli.py'), ...args],
    { encoding: 'utf-8', cwd: SMRITI_ROOT, env: bridgeEnv() },
  );
  return JSON.parse(output.trim()) as ParserResult;
}

export function runAnalytics(sql: string): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  const output = execFileSync(
    PYTHON,
    [
      join(SMRITI_ROOT, 'parser/analytics.py'),
      '--sql',
      sql,
      '--gold-glob',
      goldGlob(),
    ],
    { encoding: 'utf-8', cwd: SMRITI_ROOT, env: bridgeEnv() },
  );
  return JSON.parse(output.trim()) as {
    columns: string[];
    rows: Record<string, unknown>[];
  };
}

export function ingestToBronze(
  sourcePath: string,
  filename?: string,
): { documentId: string; bronzePath: string; bytes: number } {
  ensureWorkspaceDirs();
  const documentId = randomUUID();
  const name = filename ?? sourcePath.split('/').pop() ?? 'upload';
  const bronzePath = join(bronzeDir(), `${documentId}_${name}`);
  copyFileSync(sourcePath, bronzePath);
  const bytes = statSync(bronzePath).size;
  return { documentId, bronzePath, bytes };
}

export function ingestBase64ToBronze(
  content: string,
  filename: string,
): { documentId: string; bronzePath: string; bytes: number } {
  ensureWorkspaceDirs();
  const documentId = randomUUID();
  const bronzePath = join(bronzeDir(), `${documentId}_${filename}`);
  const buffer = Buffer.from(content, 'base64');
  writeFileSync(bronzePath, buffer);
  return { documentId, bronzePath, bytes: buffer.length };
}

export function walkSupportedFiles(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  for (const entry of readdirSync(dirPath)) {
    const full = join(dirPath, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkSupportedFiles(full));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

export function readMetricsFile(): Record<string, unknown> | null {
  if (!existsSync(metricsPath())) return null;
  return JSON.parse(readFileSync(metricsPath(), 'utf-8')) as Record<
    string,
    unknown
  >;
}
