import assert from 'node:assert/strict';
import { buildThreadMessageMetadata } from './thread-message-metadata';

const meta = JSON.parse(
  buildThreadMessageMetadata({
    role: 'assistant',
    model: 'gpt-4',
    latencyMs: 1200,
    promptTokens: 10,
    completionTokens: 25,
    finishReason: 'stop',
    toolName: 'search',
    isMcp: false,
  }),
);

assert.equal(meta.model, 'gpt-4');
assert.equal(meta.latency_ms, 1200);
assert.equal(meta.prompt_tokens, 10);
assert.equal(meta.completion_tokens, 25);
assert.equal(meta.finish_reason, 'stop');
assert.equal(meta.tool_name, 'search');
assert.equal(meta.is_mcp, false);

console.log('thread-message-metadata.verify.ts: ok');
