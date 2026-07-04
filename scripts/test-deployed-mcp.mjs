#!/usr/bin/env node
/**
 * Test deployed Smriti MCP + NitroChat integration.
 */
import https from 'node:https';

const NITROCHAT = 'https://nitrochat-yyy-6a3e700a-hemants-org-9744dc11.staging.nitrocloud.ai';
const MCP = 'https://test-apaf-hemant-6a29338c-hemants-org-9744dc11.staging.nitrocloud.ai';

const report = {
  nitrochatUrl: `${NITROCHAT}/embed`,
  mcpServerUrl: MCP,
  checks: [],
};

function req(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data }),
        );
      },
    );
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function pass(name, detail) {
  report.checks.push({ name, ok: true, detail });
  console.log(`✓ ${name}: ${detail}`);
}
function fail(name, detail) {
  report.checks.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

console.log('\n=== Deployed NitroChat + Smriti MCP Test ===\n');

// 1. NitroChat embed loads
try {
  const embed = await req(`${NITROCHAT}/embed`);
  if (embed.status === 200 && embed.body.includes('NitroChat')) {
    pass('NitroChat embed page', `HTTP ${embed.status}`);
  } else fail('NitroChat embed page', `HTTP ${embed.status}`);
} catch (e) {
  fail('NitroChat embed page', e.message);
}

// 2. NitroChat config
let mcpUrl = MCP;
try {
  const cfg = await req(`${NITROCHAT}/api/config`);
  const config = JSON.parse(cfg.body);
  mcpUrl = config?.mcp?.serverUrl || MCP;
  pass('NitroChat /api/config', `MCP=${mcpUrl}, features.tools=${config?.features?.showTools}`);
  report.suggestedPrompts = config?.chat?.suggestedPrompts;
} catch (e) {
  fail('NitroChat /api/config', e.message);
}

// 3. MCP docs page lists Smriti tools
try {
  const docs = await req(`${mcpUrl}/`);
  const tools = [
    'upload_document',
    'upload_folder',
    'identify_template',
    'generate_parser',
    'execute_parser',
    'get_pipeline_metrics',
    'analytics_query',
    'list_failures',
    'install_plugin',
  ];
  const found = tools.filter((t) => docs.body.includes(t));
  if (found.length === tools.length) {
    pass('MCP docs — PRD tools', `all ${tools.length} tools listed`);
  } else {
    fail('MCP docs — PRD tools', `found ${found.length}/${tools.length}: ${found.join(', ')}`);
  }
  if (docs.body.includes('smriti-mcp')) {
    pass('MCP server identity', 'smriti-mcp');
  } else {
    fail('MCP server identity', 'smriti-mcp title not found');
  }
} catch (e) {
  fail('MCP docs page', e.message);
}

// 4. MCP SSE transport
let sessionId = null;
let messageEndpoint = null;
try {
  const sse = await req(`${mcpUrl}/sse`, {
    headers: { Accept: 'text/event-stream' },
  });
  const match = sse.body.match(/sessionId=([a-f0-9-]+)/);
  const ep = sse.body.match(/data: (\/mcp\/messages\?sessionId=[^\n]+)/);
  sessionId = match?.[1];
  messageEndpoint = ep?.[1];
  if (sessionId && messageEndpoint) {
    pass('MCP SSE session', `sessionId=${sessionId.slice(0, 8)}...`);
  } else {
    fail('MCP SSE session', sse.body.slice(0, 200));
  }
} catch (e) {
  fail('MCP SSE session', e.message);
}

// 5. MCP tools/list via session
if (sessionId && messageEndpoint) {
  try {
    const init = await req(`${mcpUrl}${messageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'deploy-test', version: '1.0' },
      },
    });

    await req(`${mcpUrl}${messageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });

    const toolsList = await req(`${mcpUrl}${messageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const parsed = JSON.parse(toolsList.body);
    const count = parsed?.result?.tools?.length ?? 0;
    const names = (parsed?.result?.tools ?? []).map((t) => t.name);
    if (count >= 9) {
      pass('MCP tools/list', `${count} tools: ${names.slice(0, 5).join(', ')}...`);
      report.mcpTools = names;
    } else {
      fail('MCP tools/list', toolsList.body.slice(0, 300));
    }

    // 6. Call get_pipeline_metrics
    const metricsCall = await req(`${mcpUrl}${messageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_pipeline_metrics', arguments: {} },
    });
    const metricsResult = JSON.parse(metricsCall.body);
    if (metricsResult?.result?.content) {
      pass('MCP get_pipeline_metrics', metricsResult.result.content[0]?.text?.slice(0, 120));
    } else if (metricsResult?.error) {
      fail('MCP get_pipeline_metrics', JSON.stringify(metricsResult.error));
    } else {
      fail('MCP get_pipeline_metrics', metricsCall.body.slice(0, 200));
    }

    // 7. Call list_plugins
    const pluginsCall = await req(`${mcpUrl}${messageEndpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_plugins', arguments: {} },
    });
    const pluginsResult = JSON.parse(pluginsCall.body);
    if (pluginsResult?.result?.content) {
      pass('MCP list_plugins', pluginsResult.result.content[0]?.text?.slice(0, 120));
    } else {
      fail('MCP list_plugins', pluginsCall.body.slice(0, 200));
    }
  } catch (e) {
    fail('MCP tool calls', e.message);
  }
}

// 8. NitroChat gateway — does it see MCP tools?
try {
  const chat = await req(`${NITROCHAT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    messages: [{ role: 'user', content: 'Call get_pipeline_metrics and report the numbers.' }],
    provider: 'gateway',
  });
  const chatResult = JSON.parse(chat.body);
  const content = chatResult?.message?.content || chatResult?.error || chat.body;
  report.chatResponse = content.slice(0, 500);
  if (content.includes('0 tools') || content.toLowerCase().includes("don't have access")) {
    fail('NitroChat MCP integration', 'Chat bot reports 0 MCP tools available');
  } else if (content.includes('totalFiles') || content.includes('completed')) {
    pass('NitroChat MCP integration', 'Bot returned pipeline metrics');
  } else {
    fail('NitroChat MCP integration', content.slice(0, 200));
  }
} catch (e) {
  fail('NitroChat /api/chat', e.message);
}

console.log('\n=== Summary ===');
const ok = report.checks.filter((c) => c.ok).length;
const bad = report.checks.filter((c) => !c.ok).length;
console.log(`${ok} passed, ${bad} failed\n`);

import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/nitrochat-mcp-report.json', JSON.stringify(report, null, 2));
console.log('Full report: /tmp/nitrochat-mcp-report.json');

process.exit(bad > 0 ? 1 : 0);
