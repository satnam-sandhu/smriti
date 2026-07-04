import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { DocumentIntelligenceModule } from './modules/document-intelligence/document-intelligence.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'smriti-mcp',
    version: '0.2.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'Smriti MCP server — document ingestion tools (Full PRD)',
  imports: [ConfigModule.forRoot(), DocumentIntelligenceModule],
  providers: [SystemHealthCheck],
})
export class AppModule {}
