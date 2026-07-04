import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PYTHON = existsSync(join(ROOT, 'parser/.venv/bin/python3'))
  ? join(ROOT, 'parser/.venv/bin/python3')
  : 'python3';

function runParser(filePath: string) {
  const output = execFileSync(
    PYTHON,
    [join(ROOT, 'parser/cli.py'), '--file', filePath],
    { encoding: 'utf-8', cwd: ROOT },
  );
  return JSON.parse(output);
}

function runAnalytics(sql: string, goldGlob: string) {
  const output = execFileSync(
    PYTHON,
    [
      join(ROOT, 'parser/analytics.py'),
      '--sql',
      sql,
      '--gold-glob',
      goldGlob,
    ],
    { encoding: 'utf-8', cwd: ROOT },
  );
  return JSON.parse(output);
}

export class SmritiTools {
  @Tool({
    name: 'upload_document',
    description: 'Ingest a single document into Smriti Bronze layer and parse it',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the document file'),
    }),
  })
  async uploadDocument(input: { file_path: string }, ctx: ExecutionContext) {
    const bronzeDir = join(ROOT, 'data/bronze');
    mkdirSync(bronzeDir, { recursive: true });

    const dest = join(bronzeDir, input.file_path.split('/').pop() ?? 'upload');
    copyFileSync(input.file_path, dest);

    ctx.logger.info('Uploaded document', { dest });
    const result = runParser(dest);

    return {
      status: result.errorCode ? 'failed' : 'completed',
      bronzePath: dest,
      parserPath: result.parserPath,
      silverJson: result.silverJson,
      errorCode: result.errorCode,
      errorDetail: result.errorDetail,
    };
  }

  @Tool({
    name: 'get_pipeline_metrics',
    description: 'Return Smriti pipeline metrics snapshot',
    inputSchema: z.object({}),
  })
  async getPipelineMetrics(_input: Record<string, never>, ctx: ExecutionContext) {
    const metricsPath = join(ROOT, 'data/metrics.json');
    if (existsSync(metricsPath)) {
      return JSON.parse(readFileSync(metricsPath, 'utf-8'));
    }

    ctx.logger.info('No metrics file yet — returning defaults');
    return {
      totalFiles: 0,
      totalBytes: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      accuracyPct: 0,
      validationPassRate: 0,
      aiParsed: 0,
      deterministicParsed: 0,
      recentFailures: [],
    };
  }

  @Tool({
    name: 'analytics_query',
    description: 'Run DuckDB SQL against Smriti Gold Parquet partitions',
    inputSchema: z.object({
      sql: z
        .string()
        .describe("SQL query. Use read_parquet('GOLD_GLOB') for gold layer"),
    }),
  })
  async analyticsQuery(input: { sql: string }, ctx: ExecutionContext) {
    const goldGlob = join(
      ROOT,
      'data/gold/domain=healthcare/year=2026/month=07/*.parquet',
    );
    ctx.logger.info('Running analytics query', { sql: input.sql });
    return runAnalytics(input.sql, goldGlob);
  }
}
