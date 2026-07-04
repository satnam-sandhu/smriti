/**
 * Run: npx tsx lib/chat-api-payload.verify.ts
 * NC-2 verification — trim keeps tool chains in pre-active window.
 */

import { trimMessagesForModel, type TrimMessageInput } from './chat-api-payload.js';

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

function countRole(msgs: { role?: string }[], role: string) {
  return msgs.filter((m) => m.role === role).length;
}

console.log('\n=== NC-2 chat-api-payload verification ===\n');

const toolPayload = '{"success":true,"groupId":"seller"}';

// Build 30 pre-active messages: 10 tool rounds (assistant+tool) + filler users, then active user turn
const preMessages: Array<{
  role: string;
  content: string;
  hidden?: boolean;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, string> }>;
  toolCallId?: string;
}> = [];

for (let i = 0; i < 10; i++) {
  preMessages.push({
    role: 'user',
    content: `old user ${i}`,
  });
  preMessages.push({
    role: 'assistant',
    content: '',
    toolCalls: [{ id: `call_pre_${i}`, name: 'submit_group_answers', arguments: { step: String(i) } }],
  });
  preMessages.push({
    role: 'tool',
    content: toolPayload,
    toolCallId: `call_pre_${i}`,
  });
}

const activeUser = { role: 'user', content: 'latest question' };
const activeAssistant = { role: 'assistant', content: 'working...' };
const all = [...preMessages, activeUser, activeAssistant];

const trimmed = trimMessagesForModel(all, 20);

ok('active user message preserved', trimmed.some((m) => m.content === 'latest question'));
ok('active assistant preserved', trimmed.some((m) => m.content === 'working...'));

const preTrimmed = trimmed.slice(0, trimmed.findIndex((m) => m.content === 'latest question')) as TrimMessageInput[];
const toolCount = countRole(preTrimmed, 'tool');
const assistantWithTools = preTrimmed.filter(
  (m) => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0,
).length;

ok('pre-active keeps some tool results (not zero)', toolCount > 0);
ok('pre-active keeps assistant tool_calls rows', assistantWithTools > 0);

for (const m of preTrimmed) {
  const tcs = m.toolCalls as Array<{ id: string }> | undefined;
  if (m.role === 'assistant' && tcs?.length) {
    const id = tcs[0].id;
    ok(
      `tool chain paired for ${id}`,
      preTrimmed.some((r) => r.role === 'tool' && r.toolCallId === id),
    );
  }
}

// Hidden + orphan tool dropped
const withHidden = trimMessagesForModel(
  [
    { role: 'tool', content: 'orphan', toolCallId: 'x' },
    { role: 'user', content: 'hi', hidden: true },
    { role: 'user', content: 'visible' },
  ],
  10,
);
ok('orphan pre-active tool dropped', !withHidden.some((m) => m.role === 'tool' && m.toolCallId === 'x'));
ok('hidden user dropped', !withHidden.some((m) => m.hidden === true));

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
