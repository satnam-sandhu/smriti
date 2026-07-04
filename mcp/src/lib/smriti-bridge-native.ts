/**
 * Native TypeScript MCP bridge — no Python or native addons required.
 * Persists state in WORKSPACE/smriti-state.json (cloud-safe).
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  WORKSPACE,
  ensureWorkspaceDirs,
  pluginPath,
  quarantineDir,
  silverDir,
  SMRITI_ROOT,
} from './smriti-paths.js';

const PLUGIN_DEFINITIONS = {
  healthcare: {
    name: 'healthcare-plugin',
    version: '1.0.0',
    supportedTypes: ['receipt', 'clinical', 'ledger'],
    status: 'active',
    schemas: ['MedicalReceipt', 'ClinicalPdf', 'PatientLedger'],
  },
  finance: {
    name: 'finance-plugin',
    version: '1.0.0',
    supportedTypes: ['report', 'ledger', 'statement'],
    status: 'active',
    schemas: ['FinancialReport', 'AccountLedger', 'BankStatement'],
  },
} as const;

interface FileRow {
  id: string;
  file_name: string;
  status: string;
  parser_path: string | null;
  bronze_path: string;
  silver_path: string | null;
  bytes: number;
  error_code: string | null;
  error_detail: string | null;
  accuracy_pct: number | null;
  created_at: string;
}

interface FailureRow {
  id: number;
  file_id: string;
  file_name: string;
  error_code: string;
  error_detail: string | null;
  timestamp: string;
}

interface State {
  files: FileRow[];
  failures: FailureRow[];
  nextFailureId: number;
}

const STATE_PATH = () => join(WORKSPACE, 'smriti-state.json');

function templateManifestPath(): string | null {
  const candidates = [
    join(SMRITI_ROOT, 'parser/templates-manifest.json'),
    join(process.cwd(), 'parser/templates-manifest.json'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function loadState(): State {
  ensureWorkspaceDirs();
  if (!existsSync(STATE_PATH())) {
    return { files: [], failures: [], nextFailureId: 1 };
  }
  return JSON.parse(readFileSync(STATE_PATH(), 'utf-8')) as State;
}

function saveState(state: State) {
  writeFileSync(STATE_PATH(), JSON.stringify(state, null, 2));
}

function parseArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    if (key) out[key.replace(/-/g, '_')] = args[i + 1] ?? '';
  }
  return out;
}

export function detectDocType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.startsWith('statement') || lower.startsWith('receipt')) return 'statement';
  if (lower.startsWith('report') || lower.startsWith('clinical')) return 'report';
  if (lower.startsWith('ledger')) return 'ledger';
  if (/\.(png|jpg|jpeg|tiff)$/.test(lower)) return 'statement';
  if (lower.endsWith('.pdf')) return 'report';
  if (/\.(xlsx|xls)$/.test(lower)) return 'ledger';
  return 'report';
}

function fingerprintFile(filePath: string, docType: string): string {
  const content = readFileSync(filePath).subarray(0, 500);
  const raw = `${docType}:${content.toString('hex')}`;
  return createHash('sha256').update(raw).digest('hex');
}

function lookupTemplate(fp: string): Record<string, unknown> | null {
  for (const row of loadTemplateManifest()) {
    if (row.fingerprint === fp) return JSON.parse(row.dsl_json);
  }
  return null;
}

function loadTemplateManifest(): Array<{
  fingerprint: string;
  doc_type: string;
  dsl_json: string;
  created_at: string;
}> {
  const path = templateManifestPath();
  if (!path) return [];
  return JSON.parse(readFileSync(path, 'utf-8')) as Array<{
    fingerprint: string;
    doc_type: string;
    dsl_json: string;
    created_at: string;
  }>;
}

function listTemplatesFromRegistry(): Array<{
  fingerprint: string;
  doc_type: string;
  dsl_json: string;
  created_at: string;
}> {
  return loadTemplateManifest();
}

export function runNativeBridge(command: string, args: string[] = []): unknown {
  const a = parseArgs(args);

  switch (command) {
    case 'metrics': {
      const state = loadState();
      const totalFiles = state.files.length;
      const totalBytes = state.files.reduce((s, f) => s + f.bytes, 0);
      const completed = state.files.filter((f) => f.status === 'completed').length;
      const failed = state.files.filter((f) => f.status === 'failed').length;
      const inProgress = state.files.filter((f) =>
        ['queued', 'processing'].includes(f.status),
      ).length;
      const aiParsed = state.files.filter((f) => f.parser_path === 'ai').length;
      const deterministicParsed = state.files.filter((f) => f.parser_path === 'deterministic').length;
      const withAccuracy = state.files.filter((f) => f.accuracy_pct != null);
      const accuracyPct = withAccuracy.length
        ? withAccuracy.reduce((s, f) => s + (f.accuracy_pct ?? 0), 0) / withAccuracy.length
        : 0;
      const recentFailures = [...state.failures]
        .sort((x, y) => y.id - x.id)
        .slice(0, 10)
        .map((f) => ({
          fileName: f.file_name,
          errorCode: f.error_code,
          timestamp: f.timestamp,
        }));
      return {
        totalFiles,
        totalBytes,
        completed,
        failed,
        inProgress,
        accuracyPct: Math.round(accuracyPct * 10) / 10,
        validationPassRate: totalFiles ? Math.round((completed / totalFiles) * 1000) / 10 : 0,
        aiParsed,
        deterministicParsed,
        recentFailures,
      };
    }

    case 'list-plugins': {
      let active = 'finance';
      if (existsSync(pluginPath())) {
        active = JSON.parse(readFileSync(pluginPath(), 'utf-8')).active ?? 'finance';
      }
      const plugins = Object.entries(PLUGIN_DEFINITIONS).map(([key, plugin]) => ({
        ...plugin,
        active: key === active,
      }));
      return { plugins, activePlugin: active };
    }

    case 'install-plugin': {
      const name = (a.name ?? 'finance').toLowerCase();
      if (!(name in PLUGIN_DEFINITIONS)) {
        throw new Error(`Unknown plugin: ${name}. Choose healthcare or finance.`);
      }
      ensureWorkspaceDirs();
      const payload = {
        active: name,
        installedAt: new Date().toISOString(),
        ...PLUGIN_DEFINITIONS[name as keyof typeof PLUGIN_DEFINITIONS],
      };
      writeFileSync(pluginPath(), JSON.stringify(payload, null, 2));
      return { installed: name, plugin: PLUGIN_DEFINITIONS[name as keyof typeof PLUGIN_DEFINITIONS] };
    }

    case 'list-templates': {
      const rows = listTemplatesFromRegistry();
      const templates = rows.map((row) => {
        const dsl = JSON.parse(row.dsl_json) as Record<string, unknown>;
        let fields: string[] = [];
        if (typeof dsl.fields === 'object' && dsl.fields) fields = Object.keys(dsl.fields);
        else if (typeof dsl.columns === 'object' && dsl.columns)
          fields = Object.keys(dsl.columns);
        return {
          templateId: row.fingerprint.slice(0, 16),
          fingerprint: row.fingerprint,
          name: `${row.doc_type.charAt(0).toUpperCase()}${row.doc_type.slice(1)} Template`,
          documentType: row.doc_type,
          fields,
          createdAt: row.created_at,
        };
      });
      return { templates };
    }

    case 'list-failures': {
      const state = loadState();
      const failures = [...state.failures]
        .sort((x, y) => y.id - x.id)
        .slice(0, 50)
        .map((f) => ({
          file_id: f.file_id,
          file_name: f.file_name,
          error_code: f.error_code,
          error_detail: f.error_detail,
          timestamp: f.timestamp,
        }));
      const sidecars: unknown[] = [];
      const q = quarantineDir();
      if (existsSync(q)) {
        for (const f of readdirSync(q)) {
          if (f.endsWith('.error.json')) {
            sidecars.push(JSON.parse(readFileSync(join(q, f), 'utf-8')));
          }
        }
      }
      return { failures, quarantineSidecars: sidecars };
    }

    case 'register-file': {
      const state = loadState();
      state.files.push({
        id: a.document_id,
        file_name: a.filename,
        status: 'queued',
        parser_path: null,
        bronze_path: a.bronze_path,
        silver_path: null,
        bytes: Number(a.bytes),
        error_code: null,
        error_detail: null,
        accuracy_pct: null,
        created_at: new Date().toISOString(),
      });
      saveState(state);
      return { documentId: a.document_id, status: 'queued' };
    }

    case 'update-file': {
      const state = loadState();
      const row = state.files.find((f) => f.id === a.document_id);
      if (!row) throw new Error(`Unknown document: ${a.document_id}`);
      row.status = a.status;
      row.parser_path = a.parser_path || null;
      row.silver_path = a.silver_path || null;
      row.error_code = a.error_code || null;
      row.error_detail = a.error_detail || null;
      row.accuracy_pct = a.accuracy_pct ? Number(a.accuracy_pct) : null;
      saveState(state);
      return { documentId: a.document_id, status: a.status };
    }

    case 'record-failure': {
      const state = loadState();
      state.failures.push({
        id: state.nextFailureId++,
        file_id: a.document_id,
        file_name: a.filename,
        error_code: a.error_code,
        error_detail: a.error_detail ?? '',
        timestamp: new Date().toISOString(),
      });
      saveState(state);
      return { recorded: true };
    }

    case 'get-document': {
      const state = loadState();
      const row = state.files.find((f) => f.id === a.document_id);
      if (!row) return { found: false };
      let extractedData = null;
      if (row.silver_path && existsSync(row.silver_path)) {
        extractedData = JSON.parse(readFileSync(row.silver_path, 'utf-8'));
      }
      return {
        found: true,
        documentId: row.id,
        filename: row.file_name,
        status: row.status,
        parserPath: row.parser_path,
        bronzePath: row.bronze_path,
        silverPath: row.silver_path,
        extractedData,
        errorCode: row.error_code,
        errorDetail: row.error_detail,
        accuracyPct: row.accuracy_pct,
        bytes: row.bytes,
      };
    }

    case 'search': {
      const query = (a.query ?? '').toLowerCase();
      const terms = query.split(/\s+/).filter(Boolean);
      const state = loadState();
      const results = state.files
        .filter((row) => row.status === 'completed')
        .filter((row) => {
          let silver: Record<string, unknown> = {};
          if (row.silver_path && existsSync(row.silver_path)) {
            silver = JSON.parse(readFileSync(row.silver_path, 'utf-8'));
          }
          const haystack = `${row.file_name} ${row.parser_path ?? ''} ${JSON.stringify(silver)}`.toLowerCase();
          return !terms.length || terms.every((t) => haystack.includes(t));
        })
        .map((row) => {
          let extractedData = {};
          if (row.silver_path && existsSync(row.silver_path)) {
            extractedData = JSON.parse(readFileSync(row.silver_path, 'utf-8'));
          }
          return {
            documentId: row.id,
            score: 0.9,
            metadata: {
              filename: row.file_name,
              parserPath: row.parser_path,
              status: row.status,
            },
            extractedData,
          };
        });
      return { results };
    }

    case 'classify': {
      const docType = detectDocType(a.file?.split('/').pop() ?? '');
      return {
        documentType: docType,
        industry: docType === 'report' ? 'Banking & Finance' : 'General',
        confidence: docType === 'report' ? 0.89 : 0.95,
        metadata: { filename: a.file?.split('/').pop() },
      };
    }

    case 'identify': {
      const docType = detectDocType(a.file?.split('/').pop() ?? '');
      const fp = fingerprintFile(a.file, docType);
      const dsl = lookupTemplate(fp);
      return {
        fingerprint: fp,
        docType,
        templateFound: dsl !== null,
        templateId: dsl ? fp.slice(0, 16) : null,
        dsl,
      };
    }

    default:
      throw new Error(`Native bridge does not support command: ${command}`);
  }
}

export function runAnalyticsNative(sql: string, goldGlob: string): {
  columns: string[];
  rows: Record<string, unknown>[];
} {
  void goldGlob;
  const dir = silverDir();
  if (!existsSync(dir)) return { columns: [], rows: [] };

  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .slice(0, 10)
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Record<string, unknown>);

  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  const limit = limitMatch ? Number(limitMatch[1]) : rows.length;
  return { columns, rows: rows.slice(0, limit) };
}
