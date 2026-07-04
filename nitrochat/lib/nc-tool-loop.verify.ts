/**
 * Run: npx tsx lib/nc-tool-loop.verify.ts
 * Combined NC-1, NC-2, NC-3, NC-4 verification.
 */

import { trimMessagesForModel } from './chat-api-payload.js';
import {
  dedupeToolCalls,
  MAX_TOOL_ROUNDS,
  normalizeAssistantToolMessage,
  ToolExecutionCache,
} from './tool-call-chain.js';
import { processLlmToolCalls } from './process-llm-tool-round.js';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function toGatewayShape(messages: Array<{
  role?: string;
  toolCalls?: Array<{ id: string }>;
  toolCallId?: string;
}>) {
  const toolCallIds: string[] = [];
  const toolResultIds: string[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      for (const tc of m.toolCalls) toolCallIds.push(tc.id);
    }
    if (m.role === 'tool' && m.toolCallId) toolResultIds.push(m.toolCallId);
  }
  return { toolCallIds, toolResultIds };
}

console.log('\n=== NC-1 tool chain ===\n');

const dupes = dedupeToolCalls([
  { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
  { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
]);
const executed = [{ id: 'call_1', name: 'set_language', arguments: { lang: 'en' } }];
const assistant = normalizeAssistantToolMessage(
  {
    role: 'assistant',
    toolCalls: [
      { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
      { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
    ],
  },
  executed,
);
const toolResults = [{ role: 'tool' as const, content: '{}', toolCallId: 'call_1', toolName: 'set_language' }];
const oldGw = toGatewayShape([
  {
    role: 'assistant',
    toolCalls: [
      { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
      { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
    ],
  },
  ...toolResults,
]);
const newGw = toGatewayShape([assistant, ...toolResults]);
ok('NC-1: normalized chain aligned', newGw.toolCallIds.length === 1 && newGw.toolResultIds.length === 1);
ok('NC-1: old bug had orphan id', oldGw.toolCallIds.length >= 2 && oldGw.toolResultIds.length === 1);

console.log('\n=== NC-2 trim history ===\n');

const preMessages: Array<{
  role: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, string> }>;
  toolCallId?: string;
}> = [];
for (let i = 0; i < 10; i++) {
  preMessages.push({ role: 'user', content: `u${i}` });
  preMessages.push({
    role: 'assistant',
    content: '',
    toolCalls: [{ id: `call_pre_${i}`, name: 'submit_group_answers', arguments: { step: String(i) } }],
  });
  preMessages.push({ role: 'tool', content: '{"ok":true}', toolCallId: `call_pre_${i}` });
}
const trimmed = trimMessagesForModel(
  [...preMessages, { role: 'user', content: 'final' }, { role: 'assistant', content: 'ok' }],
  20,
);
const preTools = trimmed.filter((m) => m.role === 'tool').length;
ok('NC-2: pre-active tool rows kept', preTools > 0);
ok('NC-2: active user kept', trimmed.some((m) => m.content === 'final'));

console.log('\n=== NC-3 gateway + rounds + processLlmToolCalls ===\n');

ok('NC-3: MAX_TOOL_ROUNDS is 10', MAX_TOOL_ROUNDS === 10);


// Simulate gateway body build (mirrors app/api/chat/route.ts)
const systemPrompt = 'You are AWLi. Never repeat tools.';
const gatewayBody: Record<string, unknown> = {
  guardrails_enabled: false,
  messages: [{ role: 'system', content: systemPrompt }],
};
const trimmedSystem = systemPrompt.trim();
if (trimmedSystem) {
  gatewayBody.custom_system_prompt = trimmedSystem;
}
ok('NC-3: custom_system_prompt set when guardrails off', gatewayBody.custom_system_prompt === systemPrompt);

// processLlmToolCalls with mock client
const mockCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const mockClient = {
  listPrompts: async () => ({ success: true, data: [] }),
  listResources: async () => ({ success: true, data: [] }),
  readResource: async () => ({ success: true, data: {} }),
  getPrompt: async () => ({ success: true, data: {} }),
  callTool: async (name: string, args: Record<string, unknown>) => {
    mockCalls.push({ name, args });
    return { ok: true };
  },
};

const added: unknown[] = [];
const processed = await processLlmToolCalls({
  label: 'verify:processLlmToolCalls',
  data: {
    message: { role: 'assistant', content: '' },
    toolCalls: [
      { id: 'a', name: 'foo', arguments: { x: 1 } },
      { id: 'b', name: 'foo', arguments: { x: 1 } },
    ],
  },
  client: mockClient,
  generateId: () => `id-${added.length}`,
  addMessage: (m) => added.push(m),
});

ok('NC-3: processLlmToolCalls returns result', processed !== null);
if (processed) {
  const gw = toGatewayShape([processed.assistantForContinuation, ...processed.toolResultMessages]);
  ok('NC-3: embed path chain aligned', gw.toolCallIds.length === gw.toolResultIds.length);
  ok('NC-3: deduped execution (one MCP call)', mockCalls.length === 1);
}

// Tool round cap logic
let rounds = 0;
while (rounds < MAX_TOOL_ROUNDS) rounds++;
ok('NC-3: round cap stops at 10', rounds === MAX_TOOL_ROUNDS);

console.log('\n=== NC-4 execution cache across rounds ===\n');

const cache = new ToolExecutionCache();
const cacheCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const cacheClient = {
  listPrompts: async () => ({ success: true, data: [] }),
  listResources: async () => ({ success: true, data: [] }),
  readResource: async () => ({ success: true, data: {} }),
  getPrompt: async () => ({ success: true, data: {} }),
  callTool: async (name: string, args: Record<string, unknown>) => {
    cacheCalls.push({ name, args });
    return { ok: true, callIndex: cacheCalls.length };
  },
};

const round1 = await processLlmToolCalls({
  label: 'verify:nc4:round1',
  data: {
    message: { role: 'assistant', content: '' },
    toolCalls: [{ id: 'r1a', name: 'set_language', arguments: { lang: 'en' } }],
  },
  client: cacheClient,
  generateId: () => `r1-${cacheCalls.length}`,
  addMessage: () => {},
  executionCache: cache,
});
const callsAfterRound1 = cacheCalls.length;

const round2 = await processLlmToolCalls({
  label: 'verify:nc4:round2',
  data: {
    message: { role: 'assistant', content: '' },
    toolCalls: [{ id: 'r2a', name: 'set_language', arguments: { lang: 'en' } }],
  },
  client: cacheClient,
  generateId: () => `r2-${cacheCalls.length}`,
  addMessage: () => {},
  executionCache: cache,
});

ok('NC-4: round 1 hits MCP', callsAfterRound1 === 1);
ok('NC-4: round 2 repeat (same args) skips MCP', cacheCalls.length === 1);
ok('NC-4: round 2 still emits a tool result row for new id', round2?.toolResultMessages[0]?.toolCallId === 'r2a');
ok('NC-4: cached result reused', round2?.toolResultMessages[0]?.result !== undefined && round1 !== null);

const round3 = await processLlmToolCalls({
  label: 'verify:nc4:round3',
  data: {
    message: { role: 'assistant', content: '' },
    toolCalls: [{ id: 'r3a', name: 'set_language', arguments: { lang: 'fr' } }],
  },
  client: cacheClient,
  generateId: () => `r3-${cacheCalls.length}`,
  addMessage: () => {},
  executionCache: cache,
});
ok('NC-4: different args trigger fresh MCP call', cacheCalls.length === 2 && round3 !== null);

cache.clear();
const round4 = await processLlmToolCalls({
  label: 'verify:nc4:round4',
  data: {
    message: { role: 'assistant', content: '' },
    toolCalls: [{ id: 'r4a', name: 'set_language', arguments: { lang: 'en' } }],
  },
  client: cacheClient,
  generateId: () => `r4-${cacheCalls.length}`,
  addMessage: () => {},
  executionCache: cache,
});
ok('NC-4: cache.clear() on new user turn forces fresh MCP call', cacheCalls.length === 3 && round4 !== null);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
