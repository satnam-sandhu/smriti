import { Module } from '@nitrostack/core';
import { DocumentIntelligenceTools } from './document-intelligence.tools.js';
import { DocumentIntelligenceResources } from './document-intelligence.resources.js';
import { DocumentIntelligencePrompts } from './document-intelligence.prompts.js';
import { DocumentIntelligenceService } from './document-intelligence.service.js';

@Module({
  name: 'document-intelligence',
  description:
    'Smriti document intelligence — ingestion, parsing, analytics MCP tools',
  controllers: [
    DocumentIntelligenceTools,
    DocumentIntelligenceResources,
    DocumentIntelligencePrompts,
  ],
  providers: [DocumentIntelligenceService],
})
export class DocumentIntelligenceModule {}
