/**
 * Native TypeScript MCP bridge — no Python required.
 * Used on NitroCloud and as fallback for local dev.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  WORKSPACE,
  bronzeDir,
  ensureWorkspaceDirs,
  pluginPath,
  quarantineDir,
  registryPath,
  silverDir,
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

const REGISTRY_PATH = () => registryPath();

function db(): Database.Database {
  ensureWorkspaceDirs();
  const conn = new Database(join(WORKSPACE, 'smriti.db'));
  conn.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      status TEXT NOT NULL,
      parser_path TEXT,
      bronze_path TEXT NOT NULL,
      silver_path TEXT,
      bytes INTEGER NOT NULL,
      error_code TEXT,
      error_detail TEXT,
      accuracy_pct REAL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      error_code TEXT NOT NULL,
      error_detail TEXT,
      timestamp TEXT NOT NULL
    );
  `);
  return conn;
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
  if (!existsSync(REGISTRY_PATH())) return null;
  const reg = new Database(REGISTRY_PATH(), { readonly: true });
  const row = reg
    .prepare('SELECT dsl_json FROM parser_registry WHERE fingerprint = ?')
    .get(fp) as { dsl_json: string } | undefined;
  reg.close();
  return row ? JSON.parse(row.dsl_json) : null;
}

export function runNativeBridge(command: string, args: string[] = []): unknown {
  const a = parseArgs(args);

  switch (command) {
    case 'metrics': {
      const conn = db();
      const totalFiles = (
        conn.prepare('SELECT COUNT(*) AS c FROM files').get() as { c: number }
      ).c;
      const totalBytes = (
        conn.prepare('SELECT COALESCE(SUM(bytes), 0) AS s FROM files').get() as {
          s: number;
        }
      ).s;
      const completed = (
        conn.prepare("SELECT COUNT(*) AS c FROM files WHERE status='completed'").get() as {
          c: number;
        }
      ).c;
      const failed = (
        conn.prepare("SELECT COUNT(*) AS c FROM files WHERE status='failed'").get() as {
          c: number;
        }
      ).c;
      const inProgress = (
        conn
          .prepare("SELECT COUNT(*) AS c FROM files WHERE status IN ('queued','processing')")
          .get() as { c: number }
      ).c;
      const aiParsed = (
        conn.prepare("SELECT COUNT(*) AS c FROM files WHERE parser_path='ai'").get() as {
          c: number;
        }
      ).c;
      const deterministicParsed = (
        conn
          .prepare("SELECT COUNT(*) AS c FROM files WHERE parser_path='deterministic'")
          .get() as { c: number }
      ).c;
      const accuracyPct = (
        conn
          .prepare(
            'SELECT COALESCE(AVG(accuracy_pct), 0) AS a FROM files WHERE accuracy_pct IS NOT NULL',
          )
          .get() as { a: number }
      ).a;
      const recentFailures = conn
        .prepare(
          'SELECT file_name AS fileName, error_code AS errorCode, timestamp FROM failures ORDER BY id DESC LIMIT 10',
        )
        .all();
      conn.close();
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
      if (!existsSync(REGISTRY_PATH())) return { templates: [] };
      const reg = new Database(REGISTRY_PATH(), { readonly: true });
      const rows = reg
        .prepare(
          'SELECT fingerprint, doc_type, dsl_json, created_at FROM parser_registry ORDER BY created_at DESC',
        )
        .all() as Array<{
        fingerprint: string;
        doc_type: string;
        dsl_json: string;
        created_at: string;
      }>;
      reg.close();
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
      const conn = db();
      const failures = conn
        .prepare(
          'SELECT file_id, file_name, error_code, error_detail, timestamp FROM failures ORDER BY id DESC LIMIT 50',
        )
        .all();
      conn.close();
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
      const conn = db();
      conn
        .prepare(
          `INSERT INTO files (id, file_name, status, parser_path, bronze_path, silver_path, bytes, error_code, error_detail, accuracy_pct, created_at)
           VALUES (?, ?, 'queued', NULL, ?, NULL, ?, NULL, NULL, NULL, ?)`,
        )
        .run(
          a.document_id,
          a.filename,
          a.bronze_path,
          Number(a.bytes),
          new Date().toISOString(),
        );
      conn.close();
      return { documentId: a.document_id, status: 'queued' };
    }

    case 'update-file': {
      const conn = db();
      conn
        .prepare(
          `UPDATE files SET status=?, parser_path=?, silver_path=?, error_code=?, error_detail=?, accuracy_pct=? WHERE id=?`,
        )
        .run(
          a.status,
          a.parser_path || null,
          a.silver_path || null,
          a.error_code || null,
          a.error_detail || null,
          a.accuracy_pct ? Number(a.accuracy_pct) : null,
          a.document_id,
        );
      conn.close();
      return { documentId: a.document_id, status: a.status };
    }

    case 'record-failure': {
      const conn = db();
      conn
        .prepare(
          'INSERT INTO failures (file_id, file_name, error_code, error_detail, timestamp) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          a.document_id,
          a.filename,
          a.error_code,
          a.error_detail ?? '',
          new Date().toISOString(),
        );
      conn.close();
      return { recorded: true };
    }

    case 'get-document': {
      const conn = db();
      const row = conn
        .prepare('SELECT * FROM files WHERE id = ?')
        .get(a.document_id) as Record<string, unknown> | undefined;
      conn.close();
      if (!row) return { found: false };
      let extractedData = null;
      if (row.silver_path && existsSync(String(row.silver_path))) {
        extractedData = JSON.parse(readFileSync(String(row.silver_path), 'utf-8'));
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
      const conn = db();
      const rows = conn
        .prepare("SELECT * FROM files WHERE status='completed' ORDER BY created_at DESC")
        .all() as Array<Record<string, unknown>>;
      conn.close();
      const results = rows
        .filter((row) => {
          let silver: Record<string, unknown> = {};
          if (row.silver_path && existsSync(String(row.silver_path))) {
            silver = JSON.parse(readFileSync(String(row.silver_path), 'utf-8'));
          }
          const haystack = `${row.file_name} ${row.parser_path ?? ''} ${JSON.stringify(silver)}`.toLowerCase();
          return !terms.length || terms.every((t) => haystack.includes(t));
        })
        .map((row) => {
          let extractedData = {};
          if (row.silver_path && existsSync(String(row.silver_path))) {
            extractedData = JSON.parse(readFileSync(String(row.silver_path), 'utf-8'));
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
  // Fallback: read silver JSON files when DuckDB/Python unavailable
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
