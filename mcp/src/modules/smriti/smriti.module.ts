import { Module } from '@nitrostack/core';
import { SmritiTools } from './smriti.tools.js';

@Module({
  name: 'smriti',
  description: 'Smriti document ingestion MCP tools',
  providers: [SmritiTools],
})
export class SmritiModule {}
