/**
 * Run: npx tsx lib/tool-call-chain.verify.ts
 * NC-1 verification — no test framework required.
 */

import {
  assertToolChainAligned,
  dedupeToolCalls,
  normalizeAssistantToolMessage,
} from './tool-call-chain.js';

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

/** Mirrors app/api/chat/route.ts gateway mapping for tool turns. */
function toGatewayShape(
  messages: Array<{
    role: string;
    content?: string;
    toolCalls?: Array<{ id: string; name: string; arguments?: Record<string, unknown> }>;
    toolCallId?: string;
  }>,
) {
  const toolCallIds: string[] = [];
  const toolResultIds: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) toolCallIds.push(tc.id);
    }
    if (msg.role === 'tool' && msg.toolCallId) toolResultIds.push(msg.toolCallId);
  }
  return { toolCallIds, toolResultIds };
}

console.log('\n=== NC-1 tool-call-chain verification ===\n');

// 1. Dedupe
const dupes = dedupeToolCalls([
  { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
  { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
]);
ok('dedupe removes duplicate name+args', dupes.length === 1 && dupes[0].id === 'call_1');

const kept = dedupeToolCalls([
  { id: 'a', name: 't', arguments: { x: 1 } },
  { id: 'b', name: 't', arguments: { x: 2 } },
]);
ok('dedupe keeps different args', kept.length === 2);

// 2. Normalize matches executed set only
const executed = [{ id: 'call_1', name: 'set_language', arguments: { lang: 'en' } }];
const assistant = normalizeAssistantToolMessage(
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
      { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
    ],
  },
  executed,
);
ok('normalize keeps one tool_call', assistant.toolCalls.length === 1);
ok('normalize preserves executed id', assistant.toolCalls[0].id === 'call_1');

const toolResults = [
  { role: 'tool' as const, content: '{"ok":true}', toolCallId: 'call_1', toolName: 'set_language' },
];

// 3. Old bug vs new continuation payload
const oldHistory = [
  { role: 'user', content: 'english' },
  {
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'call_1', name: 'set_language', arguments: { lang: 'en' } },
      { id: 'call_2', name: 'set_language', arguments: { lang: 'en' } },
    ],
  },
  ...toolResults,
];
const newHistory = [
  { role: 'user', content: 'english' },
  assistant,
  ...toolResults,
];

const oldGw = toGatewayShape(oldHistory);
const newGw = toGatewayShape(newHistory);

ok('OLD payload: orphan tool_call id (bug)', oldGw.toolCallIds.length === 2 && oldGw.toolResultIds.length === 1);
ok('NEW payload: aligned ids', newGw.toolCallIds.length === 1 && newGw.toolResultIds.length === 1);
ok(
  'NEW every tool_call_id has tool result',
  newGw.toolCallIds.every((id) => newGw.toolResultIds.includes(id)),
);
ok(
  'OLD missing result for call_2',
  oldGw.toolCallIds.includes('call_2') && !oldGw.toolResultIds.includes('call_2'),
);

// 4. assertToolChainAligned (dev) — should not throw
assertToolChainAligned(assistant, toolResults);
ok('assertToolChainAligned runs on aligned chain', true);

const badAssistant = normalizeAssistantToolMessage(undefined, executed);
ok(
  'misaligned chain detected',
  badAssistant.toolCalls.length === 1 && toolResults.length === 1,
);

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
