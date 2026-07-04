import {
  ToolDecorator as Tool,
  ExecutionContext,
  z,
  Injectable,
} from '@nitrostack/core';
import { DocumentIntelligenceService } from './document-intelligence.service.js';

@Injectable({ deps: [DocumentIntelligenceService] })
export class DocumentIntelligenceTools {
  constructor(private diService: DocumentIntelligenceService) {}

  @Tool({
    name: 'upload_document',
    description:
      'Ingest a single document into Smriti Bronze layer and parse it. Accepts file_path or base64 content.',
    inputSchema: z.object({
      file_path: z
        .string()
        .optional()
        .describe('Absolute path to the document file on disk'),
      content: z
        .string()
        .optional()
        .describe('Base64-encoded document content (alternative to file_path)'),
      filename: z
        .string()
        .optional()
        .describe('Filename when using base64 content'),
      mimeType: z
        .string()
        .optional()
        .describe('MIME type when using base64 content'),
      metadata: z
        .record(z.any())
        .optional()
        .describe('Optional metadata to attach'),
    }),
  })
  async uploadDocument(input: any, ctx: ExecutionContext) {
    ctx.logger.info('upload_document', { file_path: input.file_path });

    if (input.file_path) {
      const record = this.diService.uploadFromPath(
        input.file_path,
        input.metadata ?? {},
      );
      return {
        documentId: record.documentId,
        status: record.status === 'failed' ? 'failed' : 'completed',
        bronzePath: record.bronzePath,
        parserPath: record.parserPath,
        parserUsed: record.parserUsed,
        extractedData: record.extractedData,
        errorCode: record.errorCode,
        errorDetail: record.errorDetail,
        validationResult: record.validationResult,
      };
    }

    if (input.content && input.filename) {
      const record = this.diService.uploadFromBase64(
        input.content,
        input.filename,
        input.mimeType ?? 'application/octet-stream',
        input.metadata ?? {},
      );
      return {
        documentId: record.documentId,
        status: record.status === 'failed' ? 'failed' : 'completed',
        bronzePath: record.bronzePath,
        parserPath: record.parserPath,
        extractedData: record.extractedData,
        errorCode: record.errorCode,
        errorDetail: record.errorDetail,
      };
    }

    throw new Error('Provide either file_path or content+filename');
  }

  @Tool({
    name: 'upload_folder',
    description: 'Batch ingest all supported documents from a local folder',
    inputSchema: z.object({
      folder_path: z.string().describe('Absolute path to the folder'),
    }),
  })
  async uploadFolder(input: { folder_path: string }, ctx: ExecutionContext) {
    ctx.logger.info('upload_folder', { folder_path: input.folder_path });
    const result = this.diService.uploadFolder(input.folder_path);
    return {
      uploadedCount: result.uploaded.length,
      failedCount: result.failed.length,
      uploaded: result.uploaded.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        parserPath: d.parserPath,
      })),
      failed: result.failed.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        errorDetail: d.errorDetail,
      })),
    };
  }

  @Tool({
    name: 'identify_template',
    description: 'Match a file against the parser registry without parsing',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the document file'),
    }),
  })
  async identifyTemplate(input: { file_path: string }, ctx: ExecutionContext) {
    ctx.logger.info('identify_template', { file_path: input.file_path });
    return this.diService.identifyTemplate(input.file_path);
  }

  @Tool({
    name: 'generate_parser',
    description:
      'Invoke Gemini to create an extraction DSL for an unknown layout and save to registry',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the document file'),
    }),
  })
  async generateParser(input: { file_path: string }, ctx: ExecutionContext) {
    ctx.logger.info('generate_parser', { file_path: input.file_path });
    return this.diService.generateParser(input.file_path);
  }

  @Tool({
    name: 'execute_parser',
    description:
      'Run deterministic parser on a document using a registry template (zero LLM calls)',
    inputSchema: z.object({
      file_path: z.string().describe('Absolute path to the document file'),
    }),
  })
  async executeParser(input: { file_path: string }, ctx: ExecutionContext) {
    ctx.logger.info('execute_parser', { file_path: input.file_path });
    return this.diService.executeParser(input.file_path);
  }

  @Tool({
    name: 'get_pipeline_metrics',
    description: 'Return Smriti pipeline dashboard metrics snapshot',
    inputSchema: z.object({}),
  })
  async getPipelineMetrics(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('get_pipeline_metrics');
    return this.diService.getPipelineMetrics();
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
    ctx.logger.info('analytics_query', { sql: input.sql });
    return this.diService.runAnalyticsQuery(input.sql);
  }

  @Tool({
    name: 'list_failures',
    description: 'Return quarantined files and failure records with error codes',
    inputSchema: z.object({}),
  })
  async listFailures(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('list_failures');
    return this.diService.listFailures();
  }

  @Tool({
    name: 'install_plugin',
    description: 'Activate an industry plugin (healthcare or finance)',
    inputSchema: z.object({
      name: z
        .enum(['healthcare', 'finance'])
        .describe('Plugin to activate'),
    }),
  })
  async installPlugin(input: { name: string }, ctx: ExecutionContext) {
    ctx.logger.info('install_plugin', { name: input.name });
    return this.diService.installPlugin(input.name);
  }

  @Tool({
    name: 'classify_document',
    description:
      'Identify document type, industry, and classification confidence',
    inputSchema: z.object({
      documentId: z.string().describe('The unique document ID'),
    }),
  })
  async classifyDocument(input: { documentId: string }, ctx: ExecutionContext) {
    ctx.logger.info('classify_document', { documentId: input.documentId });
    return this.diService.classifyDocument(input.documentId);
  }

  @Tool({
    name: 'process_document',
    description:
      'End-to-end processing: identify template, generate if needed, extract, validate, store',
    inputSchema: z.object({
      documentId: z.string().describe('The unique document ID to process'),
    }),
  })
  async processDocument(input: { documentId: string }, ctx: ExecutionContext) {
    ctx.logger.info('process_document', { documentId: input.documentId });
    const record = this.diService.processDocument(input.documentId);
    return {
      documentId: record.documentId,
      templateId: record.templateId,
      parserUsed: record.parserUsed,
      extractedData: record.extractedData ?? {},
      validationResult: record.validationResult,
      storageStatus: record.status === 'processed' ? 'stored' : 'failed',
    };
  }

  @Tool({
    name: 'search_documents',
    description: 'Search processed documents by query and optional metadata filters',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      metadataFilters: z
        .record(z.any())
        .optional()
        .describe('Optional metadata filters'),
    }),
  })
  async searchDocuments(input: any, ctx: ExecutionContext) {
    ctx.logger.info('search_documents', { query: input.query });
    const results = this.diService.searchDocuments(
      input.query,
      input.metadataFilters ?? {},
    );
    return { results };
  }

  @Tool({
    name: 'get_document',
    description: 'Return structured extracted data and metadata for a document',
    inputSchema: z.object({
      documentId: z.string().describe('The unique document ID'),
    }),
  })
  async getDocument(input: { documentId: string }, ctx: ExecutionContext) {
    ctx.logger.info('get_document', { documentId: input.documentId });
    const doc = this.diService.getDocument(input.documentId);
    if (!doc) throw new Error(`Document not found: ${input.documentId}`);
    return {
      documentId: doc.documentId,
      metadata: doc.metadata,
      extractedData: doc.extractedData ?? null,
      status: doc.status,
      parserPath: doc.parserPath,
    };
  }

  @Tool({
    name: 'list_templates',
    description: 'Return all learned document templates in the parser registry',
    inputSchema: z.object({}),
  })
  async listTemplates(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('list_templates');
    return { templates: this.diService.listTemplates() };
  }

  @Tool({
    name: 'list_plugins',
    description: 'Return installed document intelligence plugins',
    inputSchema: z.object({}),
  })
  async listPlugins(_input: Record<string, never>, ctx: ExecutionContext) {
    ctx.logger.info('list_plugins');
    return { plugins: this.diService.listPlugins() };
  }
}
