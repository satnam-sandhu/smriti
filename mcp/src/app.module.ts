import { McpApp, Module, ConfigModule } from '@nitrostack/core';
import { SmritiModule } from './modules/smriti/smriti.module.js';
import { SystemHealthCheck } from './health/system.health.js';

@McpApp({
  module: AppModule,
  server: {
    name: 'smriti-mcp',
    version: '0.1.0',
  },
  logging: {
    level: 'info',
  },
})
@Module({
  name: 'app',
  description: 'Smriti MCP server — document ingestion tools',
  imports: [ConfigModule.forRoot(), SmritiModule],
  providers: [SystemHealthCheck],
})
export class AppModule {}
