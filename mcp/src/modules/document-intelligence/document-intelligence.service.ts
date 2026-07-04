import { join } from 'node:path';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Injectable } from '@nitrostack/core';
import {
  ensureWorkspaceDirs,
  ingestBase64ToBronze,
  ingestToBronze,
  quarantineDir,
  runAnalytics,
  runMcpBridge,
  runParser,
  silverDir,
  SMRITI_ROOT,
  walkSupportedFiles,
  WORKSPACE,
} from '../../lib/smriti-bridge.js';
import { GOLD_PARTITION } from '../../lib/constants.js';

export interface DocumentRecord {
  documentId: string;
  filename: string;
  mimeType: string;
  bronzePath: string;
  bytes: number;
  metadata: Record<string, unknown>;
  status: 'uploaded' | 'classified' | 'processing' | 'processed' | 'failed';
  extractedData?: Record<string, unknown>;
  validationResult?: { isValid: boolean; errors: string[] };
  templateId?: string | null;
  parserUsed?: 'pre_existing' | 'ai_generated' | 'ai' | 'deterministic';
  parserPath?: string;
  industry?: string;
  confidence?: number;
  documentType?: string;
  errorCode?: string;
  errorDetail?: string;
  accuracyPct?: number;
}

export interface TemplateRecord {
  templateId: string;
  fingerprint?: string;
  name: string;
  documentType: string;
  fields: string[];
  createdAt?: string;
}

export interface PluginRecord {
  name: string;
  version: string;
  supportedTypes: string[];
  status: string;
  active?: boolean;
}

function validationFromSilver(
  silver: Record<string, unknown>,
  errorCode?: string | null,
  errorDetail?: string | null,
) {
  const errors: string[] = [];
  if (errorCode) errors.push(`${errorCode}: ${errorDetail ?? 'Unknown error'}`);
  return { isValid: !errorCode && Object.keys(silver).length > 0, errors };
}

@Injectable()
export class DocumentIntelligenceService {
  private writeSilver(documentId: string, silver: Record<string, unknown>): string {
    ensureWorkspaceDirs();
    const silverPath = join(silverDir(), `${documentId}.json`);
    writeFileSync(silverPath, JSON.stringify(silver, null, 2));
    return silverPath;
  }

  private writeGold(documentId: string, silverPath: string): string | null {
    const goldPath = join(WORKSPACE, GOLD_PARTITION, `${documentId}.parquet`);
    try {
      runMcpBridge('write-gold', ['--input', silverPath, '--output', goldPath]);
      return goldPath;
    } catch {
      return null;
    }
  }

  private registerFile(
    documentId: string,
    filename: string,
    bronzePath: string,
    bytes: number,
  ) {
    runMcpBridge('register-file', [
      '--document-id',
      documentId,
      '--filename',
      filename,
      '--bronze-path',
      bronzePath,
      '--bytes',
      String(bytes),
    ]);
  }

  private updateFile(
    documentId: string,
    fields: {
      status: string;
      parserPath?: string;
      silverPath?: string;
      errorCode?: string;
      errorDetail?: string;
      accuracyPct?: number;
    },
  ) {
    const args = [
      '--document-id',
      documentId,
      '--status',
      fields.status,
      '--parser-path',
      fields.parserPath ?? '',
      '--silver-path',
      fields.silverPath ?? '',
      '--error-code',
      fields.errorCode ?? '',
      '--error-detail',
      fields.errorDetail ?? '',
    ];
    if (fields.accuracyPct != null) {
      args.push('--accuracy-pct', String(fields.accuracyPct));
    }
    runMcpBridge('update-file', args);
  }

  private failDocument(
    documentId: string,
    filename: string,
    bronzePath: string,
    errorCode: string,
    errorDetail: string,
  ) {
    this.updateFile(documentId, {
      status: 'failed',
      errorCode,
      errorDetail,
    });
    runMcpBridge('record-failure', [
      '--document-id',
      documentId,
      '--filename',
      filename,
      '--error-code',
      errorCode,
      '--error-detail',
      errorDetail,
    ]);

    if (existsSync(bronzePath)) {
      const dest = join(quarantineDir(), `${documentId}_${filename}`);
      renameSync(bronzePath, dest);
      writeFileSync(
        dest + '.error.json',
        JSON.stringify({ fileId: documentId, errorCode, errorDetail }),
      );
    }
  }

  private parseAndStore(
    documentId: string,
    filename: string,
    bronzePath: string,
  ): DocumentRecord {
    this.updateFile(documentId, { status: 'processing' });

    const expected = join(
      SMRITI_ROOT,
      'samples/expected',
      `${filename.replace(/\.[^.]+$/, '')}.json`,
    );

    const result = runParser(bronzePath, expected);
    if (result.errorCode) {
      this.failDocument(
        documentId,
        filename,
        bronzePath,
        result.errorCode,
        result.errorDetail ?? 'Parse failed',
      );
      return {
        documentId,
        filename,
        mimeType: 'application/octet-stream',
        bronzePath,
        bytes: 0,
        metadata: { filename },
        status: 'failed',
        errorCode: result.errorCode,
        errorDetail: result.errorDetail ?? undefined,
        validationResult: validationFromSilver(
          {},
          result.errorCode,
          result.errorDetail,
        ),
      };
    }

    const silverPath = this.writeSilver(documentId, result.silverJson);
    this.writeGold(documentId, silverPath);

    const parserPath = result.parserPath;
    this.updateFile(documentId, {
      status: 'completed',
      parserPath,
      silverPath,
      accuracyPct: result.accuracyPct ?? undefined,
    });

    return {
      documentId,
      filename,
      mimeType: 'application/octet-stream',
      bronzePath,
      bytes: 0,
      metadata: { filename, bronzePath, silverPath },
      status: 'processed',
      extractedData: result.silverJson,
      parserPath,
      parserUsed: parserPath === 'ai' ? 'ai_generated' : 'pre_existing',
      accuracyPct: result.accuracyPct ?? undefined,
      validationResult: validationFromSilver(result.silverJson),
    };
  }

  uploadFromPath(filePath: string, metadata: Record<string, unknown> = {}): DocumentRecord {
    ensureWorkspaceDirs();
    const filename = filePath.split('/').pop() ?? 'upload';
    const { documentId, bronzePath, bytes } = ingestToBronze(filePath, filename);
    this.registerFile(documentId, filename, bronzePath, bytes);
    const record = this.parseAndStore(documentId, filename, bronzePath);
    return { ...record, metadata: { ...metadata, filename, bytes }, bytes };
  }

  uploadFromBase64(
    content: string,
    filename: string,
    mimeType: string,
    metadata: Record<string, unknown> = {},
  ): DocumentRecord {
    ensureWorkspaceDirs();
    const { documentId, bronzePath, bytes } = ingestBase64ToBronze(content, filename);
    this.registerFile(documentId, filename, bronzePath, bytes);
    const record = this.parseAndStore(documentId, filename, bronzePath);
    return { ...record, mimeType, metadata: { ...metadata, filename, mimeType, bytes }, bytes };
  }

  uploadFolder(folderPath: string): { uploaded: DocumentRecord[]; failed: DocumentRecord[] } {
    const files = walkSupportedFiles(folderPath);
    const uploaded: DocumentRecord[] = [];
    const failed: DocumentRecord[] = [];

    for (const filePath of files) {
      try {
        const record = this.uploadFromPath(filePath);
        if (record.status === 'failed') failed.push(record);
        else uploaded.push(record);
      } catch (err: unknown) {
        failed.push({
          documentId: 'unknown',
          filename: filePath.split('/').pop() ?? 'unknown',
          mimeType: 'application/octet-stream',
          bronzePath: filePath,
          bytes: 0,
          metadata: {},
          status: 'failed',
          errorDetail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { uploaded, failed };
  }

  identifyTemplate(filePath: string) {
    return runMcpBridge('identify', ['--file', filePath]) as Record<string, unknown>;
  }

  generateParser(filePath: string) {
    return runMcpBridge('generate', ['--file', filePath]) as Record<string, unknown>;
  }

  executeParser(filePath: string) {
    return runMcpBridge('execute', ['--file', filePath]) as Record<string, unknown>;
  }

  classifyDocument(documentId: string) {
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);
    const result = runMcpBridge('classify', ['--file', doc.bronzePath]) as Record<
      string,
      unknown
    >;
    return result;
  }

  processDocument(documentId: string): DocumentRecord {
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const identify = this.identifyTemplate(doc.bronzePath) as {
      templateFound: boolean;
    };

    if (!identify.templateFound) {
      this.generateParser(doc.bronzePath);
    }

    const execute = this.executeParser(doc.bronzePath) as {
      parserPath?: string;
      silverJson?: Record<string, unknown>;
      errorCode?: string;
      errorDetail?: string;
      templateId?: string;
    };

    if (execute.errorCode) {
      this.failDocument(
        documentId,
        doc.filename,
        doc.bronzePath,
        execute.errorCode,
        execute.errorDetail ?? 'Execute failed',
      );
      return { ...doc, status: 'failed', errorCode: execute.errorCode };
    }

    const silverPath = this.writeSilver(documentId, execute.silverJson ?? {});
    this.writeGold(documentId, silverPath);
    this.updateFile(documentId, {
      status: 'completed',
      parserPath: execute.parserPath ?? 'deterministic',
      silverPath,
    });

    return {
      ...doc,
      status: 'processed',
      extractedData: execute.silverJson,
      templateId: execute.templateId,
      parserUsed: 'pre_existing',
      parserPath: execute.parserPath,
      validationResult: validationFromSilver(execute.silverJson ?? {}),
    };
  }

  getDocument(documentId: string): DocumentRecord | undefined {
    const result = runMcpBridge('get-document', [
      '--document-id',
      documentId,
    ]) as Record<string, unknown>;
    if (!result.found) return undefined;

    return {
      documentId: result.documentId as string,
      filename: result.filename as string,
      mimeType: 'application/octet-stream',
      bronzePath: result.bronzePath as string,
      bytes: (result.bytes as number) ?? 0,
      metadata: { filename: result.filename },
      status: (result.status as DocumentRecord['status']) ?? 'uploaded',
      extractedData: (result.extractedData as Record<string, unknown>) ?? undefined,
      parserPath: result.parserPath as string | undefined,
      errorCode: result.errorCode as string | undefined,
      errorDetail: result.errorDetail as string | undefined,
      accuracyPct: result.accuracyPct as number | undefined,
      validationResult: validationFromSilver(
        (result.extractedData as Record<string, unknown>) ?? {},
        result.errorCode as string | undefined,
        result.errorDetail as string | undefined,
      ),
    };
  }

  searchDocuments(query: string, metadataFilters: Record<string, unknown> = {}) {
    const result = runMcpBridge('search', ['--query', query]) as {
      results: Array<{
        documentId: string;
        score: number;
        metadata: Record<string, unknown>;
        extractedData: Record<string, unknown>;
      }>;
    };

    if (!metadataFilters || Object.keys(metadataFilters).length === 0) {
      return result.results;
    }

    return result.results.filter((r) =>
      Object.entries(metadataFilters).every(
        ([key, val]) => r.metadata[key] === val || (r.extractedData as Record<string, unknown>)?.[key] === val,
      ),
    );
  }

  listTemplates(): TemplateRecord[] {
    const result = runMcpBridge('list-templates') as { templates: TemplateRecord[] };
    return result.templates;
  }

  getTemplate(templateId: string): TemplateRecord | undefined {
    return this.listTemplates().find(
      (t) => t.templateId === templateId || t.fingerprint?.startsWith(templateId),
    );
  }

  listPlugins(): PluginRecord[] {
    const result = runMcpBridge('list-plugins') as { plugins: PluginRecord[] };
    return result.plugins;
  }

  getPlugin(name: string): PluginRecord | undefined {
    return this.listPlugins().find((p) => p.name === name || p.name.startsWith(name));
  }

  getPipelineMetrics() {
    return runMcpBridge('metrics');
  }

  listFailures() {
    return runMcpBridge('list-failures');
  }

  installPlugin(name: string) {
    return runMcpBridge('install-plugin', ['--name', name]);
  }

  runAnalyticsQuery(sql: string) {
    return runAnalytics(sql);
  }
}
