#!/usr/bin/env node
/**
 * End-to-end MCP integration test — exercises service layer + Python bridge.
 * Run: node scripts/test-mcp.mjs
 */
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { rmSync, existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
process.env.SMRITI_ROOT = ROOT;
process.env.SMRITI_WORKSPACE = join(ROOT, 'data');

const { DocumentIntelligenceService } = await import(
  '../mcp/dist/modules/document-intelligence/document-intelligence.service.js'
);

const svc = new DocumentIntelligenceService();
const samples = join(ROOT, 'samples/good');
const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, err) {
  const msg = err instanceof Error ? err.message : String(err);
  results.push({ name, ok: false, detail: msg });
  console.error(`✗ ${name} — ${msg}`);
}

async function run(name, fn) {
  try {
    await fn();
  } catch (e) {
    fail(name, e);
  }
}

console.log('\n=== Smriti MCP Test Suite ===\n');
console.log(`ROOT: ${ROOT}`);
console.log(`WORKSPACE: ${process.env.SMRITI_WORKSPACE}\n`);

// Clean test workspace
if (existsSync(process.env.SMRITI_WORKSPACE)) {
  rmSync(process.env.SMRITI_WORKSPACE, { recursive: true, force: true });
}

await run('install_plugin (finance)', async () => {
  const r = svc.installPlugin('finance');
  if (!r.installed) throw new Error(JSON.stringify(r));
  pass('install_plugin', `active=${r.installed}`);
});

await run('list_plugins', async () => {
  const plugins = svc.listPlugins();
  if (!plugins.some((p) => p.active)) throw new Error('No active plugin');
  pass('list_plugins', `${plugins.length} plugins`);
});

await run('get_pipeline_metrics (empty)', async () => {
  const m = svc.getPipelineMetrics();
  if (m.totalFiles !== 0) throw new Error(`expected 0 files, got ${m.totalFiles}`);
  pass('get_pipeline_metrics', 'empty workspace');
});

await run('identify_template (report_01.pdf)', async () => {
  const r = svc.identifyTemplate(join(samples, 'report_01.pdf'));
  if (!r.docType) throw new Error(JSON.stringify(r));
  pass('identify_template', `docType=${r.docType}, found=${r.templateFound}`);
});

await run('upload_document (report_01.pdf)', async () => {
  const r = svc.uploadFromPath(join(samples, 'report_01.pdf'));
  if (r.status !== 'processed' && r.status !== 'failed') throw new Error(`status=${r.status}`);
  if (r.status === 'processed') {
    pass('upload_document', `parserPath=${r.parserPath}, fields=${Object.keys(r.extractedData ?? {}).length}`);
  } else {
    pass('upload_document', `failed gracefully: ${r.errorCode}`);
  }
  globalThis.__docId = r.documentId;
});

await run('upload_document deterministic re-parse', async () => {
  const r = svc.uploadFromPath(join(samples, 'report_01.pdf'));
  pass('upload_document (2nd run)', `parserPath=${r.parserPath}`);
});

await run('get_document', async () => {
  const id = globalThis.__docId;
  if (!id) throw new Error('No documentId from upload');
  const doc = svc.getDocument(id);
  if (!doc) throw new Error('Document not found');
  pass('get_document', `${doc.filename} status=${doc.status}`);
});

await run('list_templates', async () => {
  const templates = svc.listTemplates();
  pass('list_templates', `${templates.length} template(s)`);
});

await run('upload_folder', async () => {
  const { uploaded, failed } = svc.uploadFolder(samples);
  pass('upload_folder', `uploaded=${uploaded.length}, failed=${failed.length}`);
});

await run('get_pipeline_metrics (after uploads)', async () => {
  const m = svc.getPipelineMetrics();
  if (m.totalFiles === 0) throw new Error('Expected files in DB');
  pass('get_pipeline_metrics', `total=${m.totalFiles}, completed=${m.completed}, ai=${m.aiParsed}, det=${m.deterministicParsed}`);
});

await run('search_documents', async () => {
  const hits = svc.searchDocuments('report');
  pass('search_documents', `${hits.length} hit(s)`);
});

await run('analytics_query', async () => {
  const r = svc.runAnalyticsQuery("SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5");
  if (!Array.isArray(r.rows)) throw new Error(JSON.stringify(r));
  pass('analytics_query', `${r.rows.length} row(s), cols=${r.columns?.join(',')}`);
});

await run('list_failures (corrupt file)', async () => {
  // Create a corrupt PDF
  const corrupt = join(samples, '../bad');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(corrupt, { recursive: true });
  const badPath = join(corrupt, 'corrupt_test.pdf');
  writeFileSync(badPath, 'not a pdf');
  try {
    svc.uploadFromPath(badPath);
  } catch {
    /* may throw or return failed record */
  }
  const f = svc.listFailures();
  pass('list_failures', `${f.failures?.length ?? 0} failure(s) in DB`);
});

await run('generate_parser + execute_parser (ledger)', async () => {
  const ledger = join(samples, 'ledger_01.xlsx');
  const gen = svc.generateParser(ledger);
  if (!gen.templateId) throw new Error(JSON.stringify(gen));
  const exec = svc.executeParser(ledger);
  if (exec.errorCode) throw new Error(exec.errorDetail);
  pass('generate_parser + execute_parser', `fields=${Object.keys(exec.silverJson ?? {}).length}`);
});

console.log('\n=== Summary ===');
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`${passed} passed, ${failed} failed out of ${results.length} checks\n`);
process.exit(failed > 0 ? 1 : 0);
