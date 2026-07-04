import {
  ResourceDecorator as Resource,
  ExecutionContext,
  Injectable,
} from '@nitrostack/core';
import { DocumentIntelligenceService } from './document-intelligence.service.js';

@Injectable({ deps: [DocumentIntelligenceService] })
export class DocumentIntelligenceResources {
  constructor(private diService: DocumentIntelligenceService) {}

  @Resource({
    uri: 'document://{id}',
    name: 'Document Structured Data',
    description:
      'Retrieves metadata and extracted field values for a specific processed document',
    mimeType: 'application/json',
  })
  async getDocumentResource(uri: string, ctx: ExecutionContext) {
    ctx.logger.info(`Accessing resource: ${uri}`);
    const match = uri.match(/^document:\/\/([^/]+)$/);
    if (!match) throw new Error(`Invalid document URI format: ${uri}`);

    const documentId = match[1];
    const doc = this.diService.getDocument(documentId);
    if (!doc) throw new Error(`Document resource not found: ${documentId}`);

    return {
      documentId: doc.documentId,
      filename: doc.filename,
      mimeType: doc.mimeType,
      status: doc.status,
      metadata: doc.metadata,
      extractedData: doc.extractedData ?? null,
      validationResult: doc.validationResult ?? null,
    };
  }

  @Resource({
    uri: 'template://{id}',
    name: 'Document Template Definition',
    description: 'Retrieves the schema and key fields defined by a document template',
    mimeType: 'application/json',
  })
  async getTemplateResource(uri: string, ctx: ExecutionContext) {
    ctx.logger.info(`Accessing resource: ${uri}`);
    const match = uri.match(/^template:\/\/([^/]+)$/);
    if (!match) throw new Error(`Invalid template URI format: ${uri}`);

    const templateId = match[1];
    const template = this.diService.getTemplate(templateId);
    if (!template) throw new Error(`Template resource not found: ${templateId}`);
    return template;
  }

  @Resource({
    uri: 'plugin://{name}',
    name: 'Installed Plugin Information',
    description:
      'Retrieves capability details and active status for a document intelligence plugin',
    mimeType: 'application/json',
  })
  async getPluginResource(uri: string, ctx: ExecutionContext) {
    ctx.logger.info(`Accessing resource: ${uri}`);
    const match = uri.match(/^plugin:\/\/([^/]+)$/);
    if (!match) throw new Error(`Invalid plugin URI format: ${uri}`);

    const pluginName = match[1];
    const plugin = this.diService.getPlugin(pluginName);
    if (!plugin) throw new Error(`Plugin resource not found: ${pluginName}`);
    return plugin;
  }
}
