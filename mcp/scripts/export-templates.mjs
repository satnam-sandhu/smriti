#!/usr/bin/env node
/** Export parser registry templates to JSON for cloud-native MCP bridge. */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SMRITI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY = join(SMRITI_ROOT, 'parser/registry.db');
const OUT = join(SMRITI_ROOT, 'parser/templates-manifest.json');

if (!existsSync(REGISTRY)) {
  writeFileSync(OUT, '[]\n');
  process.exit(0);
}

const py = join(SMRITI_ROOT, 'parser/.venv/bin/python3');
const python = existsSync(py) ? py : 'python3';

const script = `
import json, sqlite3
conn = sqlite3.connect(${JSON.stringify(REGISTRY)})
rows = conn.execute(
  "SELECT fingerprint, doc_type, dsl_json, created_at FROM parser_registry ORDER BY created_at DESC"
).fetchall()
print(json.dumps([{"fingerprint":r[0],"doc_type":r[1],"dsl_json":r[2],"created_at":r[3]} for r in rows]))
`;

const output = execFileSync(python, ['-c', script], { encoding: 'utf-8' });
writeFileSync(OUT, output.trim() + '\n');
console.log('[export-templates]', OUT);
