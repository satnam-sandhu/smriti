import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  SMRITI_ROOT,
  WORKSPACE,
  bronzeDir,
  ensureWorkspaceDirs,
  goldGlob,
  metricsPath,
  resolvePython,
  silverDir,
  SUPPORTED_EXTENSIONS,
} from './smriti-paths.js';
import { runAnalyticsNative, runNativeBridge } from './smriti-bridge-native.js';

export {
  SMRITI_ROOT,
  WORKSPACE,
  bronzeDir,
  silverDir,
  goldGlob,
  quarantineDir,
  ensureWorkspaceDirs,
  metricsPath,
} from './smriti-paths.js';

const NATIVE_COMMANDS = new Set([
  'metrics',
  'list-plugins',
  'install-plugin',
  'list-templates',
  'list-failures',
  'register-file',
  'update-file',
  'record-failure',
  'get-document',
  'search',
  'classify',
  'identify',
]);

export const PYTHON = resolvePython();

function bridgeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMRITI_ROOT,
    SMRITI_WORKSPACE: WORKSPACE,
    PYTHONPATH: join(SMRITI_ROOT, 'parser'),
  };
}

function runPythonBridge(command: string, args: string[] = []): unknown {
  if (!PYTHON) {
    throw new Error(
      'Python parser not available. Set SMRITI_PYTHON or run scripts/setup-cloud-parser.mjs',
    );
  }
  const output = execFileSync(
    PYTHON,
    [join(SMRITI_ROOT, 'parser/mcp_bridge.py'), command, ...args],
    { encoding: 'utf-8', cwd: SMRITI_ROOT, env: bridgeEnv() },
  );
  return JSON.parse(output.trim());
}

export function runMcpBridge(command: string, args: string[] = []): unknown {
  if (NATIVE_COMMANDS.has(command)) {
    try {
      return runNativeBridge(command, args);
    } catch (err) {
      if (PYTHON) return runPythonBridge(command, args);
      throw err;
    }
  }
  if (!PYTHON) {
    throw new Error(`Command '${command}' requires Python parser (not found on PATH)`);
  }
  return runPythonBridge(command, args);
}

export interface ParserResult {
  parserPath: 'ai' | 'deterministic';
  silverJson: Record<string, unknown>;
  accuracyPct?: number | null;
  errorCode?: string | null;
  errorDetail?: string | null;
}

export function runParser(filePath: string, expectedPath?: string): ParserResult {
  if (!PYTHON) {
    return {
      parserPath: 'deterministic',
      silverJson: {},
      errorCode: 'UNKNOWN_LAYOUT',
      errorDetail: 'Python parser not available in this environment',
    };
  }
  const args = ['--file', filePath];
  if (expectedPath && existsSync(expectedPath)) args.push('--expected', expectedPath);
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
  if (PYTHON && existsSync(join(SMRITI_ROOT, 'parser/analytics.py'))) {
    try {
      const output = execFileSync(
        PYTHON,
        [join(SMRITI_ROOT, 'parser/analytics.py'), '--sql', sql, '--gold-glob', goldGlob()],
        { encoding: 'utf-8', cwd: SMRITI_ROOT, env: bridgeEnv() },
      );
      return JSON.parse(output.trim()) as { columns: string[]; rows: Record<string, unknown>[] };
    } catch {
      /* native fallback */
    }
  }
  return runAnalyticsNative(sql, goldGlob());
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
  return { documentId, bronzePath, bytes: statSync(bronzePath).size };
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
    if (st.isDirectory()) results.push(...walkSupportedFiles(full));
    else if (SUPPORTED_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

export function readMetricsFile(): Record<string, unknown> | null {
  if (!existsSync(metricsPath())) return null;
  return JSON.parse(readFileSync(metricsPath(), 'utf-8')) as Record<string, unknown>;
}

export function isPythonAvailable(): boolean {
  return PYTHON !== null;
}
