import {
  PromptDecorator as Prompt,
  ExecutionContext,
  Injectable,
} from '@nitrostack/core';
import { DocumentIntelligenceService } from './document-intelligence.service.js';

@Injectable({ deps: [DocumentIntelligenceService] })
export class DocumentIntelligencePrompts {
  constructor(private diService: DocumentIntelligenceService) {}

  @Prompt({
    name: 'Extract Document',
    description:
      'Generates a prompt to analyze a document and extract key fields in a Markdown table',
    arguments: [
      {
        name: 'documentId',
        description: 'The unique ID of the document to extract data from',
        required: true,
      },
    ],
  })
  async extractDocumentPrompt(input: { documentId: string }, ctx: ExecutionContext) {
    ctx.logger.info(`Extract Document prompt for: ${input.documentId}`);
    const doc = this.diService.getDocument(input.documentId);
    const contentDescription = doc
      ? `Filename: ${doc.filename}\nStatus: ${doc.status}\nParser: ${doc.parserPath ?? 'unknown'}`
      : `Document ID: ${input.documentId}`;

    return {
      role: 'assistant',
      content: `You are an expert Document Intelligence Assistant. Analyze document://${input.documentId}.

Document Context:
${contentDescription}

Identify the document type and extract all core fields in a clean Markdown table.`,
    };
  }

  @Prompt({
    name: 'Summarize Document',
    description: 'Generates a prompt to summarize extracted document contents',
    arguments: [
      {
        name: 'documentId',
        description: 'The unique ID of the document to summarize',
        required: true,
      },
    ],
  })
  async summarizeDocumentPrompt(input: { documentId: string }, ctx: ExecutionContext) {
    return {
      role: 'assistant',
      content: `Summarize the extracted content of document://${input.documentId}. Include key entities, amounts, dates, and action items.`,
    };
  }

  @Prompt({
    name: 'Compare Two Documents',
    description: 'Generates a prompt to compare two processed documents',
    arguments: [
      { name: 'docId1', description: 'First document ID', required: true },
      { name: 'docId2', description: 'Second document ID', required: true },
    ],
  })
  async compareTwoDocumentsPrompt(
    input: { docId1: string; docId2: string },
    ctx: ExecutionContext,
  ) {
    return {
      role: 'assistant',
      content: `Compare document://${input.docId1} with document://${input.docId2}. Detail similarities, differences, and validation issues.`,
    };
  }

  @Prompt({
    name: 'Explain Validation Errors',
    description: 'Generates a prompt to explain validation errors for a document',
    arguments: [
      {
        name: 'documentId',
        description: 'The unique ID of the document with validation errors',
        required: true,
      },
    ],
  })
  async explainValidationErrorsPrompt(
    input: { documentId: string },
    ctx: ExecutionContext,
  ) {
    const doc = this.diService.getDocument(input.documentId);
    const errors = doc?.validationResult?.errors ?? [];
    const errorsDescription =
      errors.length > 0 ? errors.map((e) => `- ${e}`).join('\n') : 'No errors logged.';

    return {
      role: 'assistant',
      content: `Explain validation errors for document://${input.documentId}:

${errorsDescription}

Propose remediation actions.`,
    };
  }
}
