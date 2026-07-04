#!/usr/bin/env node
import https from 'node:https';

const HOST = 'test-apaf-hemant-6a29338c-hemants-org-9744dc11.staging.nitrocloud.ai';
const messages = [];

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: HOST,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve(b.trim()));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseSseChunk(chunk) {
  for (const block of chunk.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (raw.startsWith('/mcp/')) continue;
    try {
      messages.push(JSON.parse(raw));
    } catch {
      /* endpoint event */
    }
  }
}

function waitFor(id, ms = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      const hit = messages.find((m) => m.id === id);
      if (hit) return resolve(hit);
      if (Date.now() - t0 > ms) return reject(new Error(`timeout id=${id}`));
      setTimeout(poll, 150);
    })();
  });
}

await new Promise((resolve, reject) => {
  const req = https.get(
    { hostname: HOST, path: '/sse', headers: { Accept: 'text/event-stream' } },
    (res) => {
      let buf = '';
      res.on('data', async (chunk) => {
        buf += chunk.toString();
        parseSseChunk(buf);
        const sid = buf.match(/sessionId=([a-f0-9-]+)/)?.[1];
        if (!sid || buf.includes('__done__')) return;
        buf += '__done__';
        const ep = `/mcp/messages?sessionId=${sid}`;

        console.log('Session:', sid);

        console.log('init:', await post(ep, {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'deploy-test', version: '1.0' },
          },
        }));

        await post(ep, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

        console.log('tools/list post:', await post(ep, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));

        try {
          const toolsMsg = await waitFor(2);
          const names = toolsMsg.result?.tools?.map((t) => t.name) ?? [];
          console.log('TOOLS COUNT:', names.length);
          console.log('TOOLS:', names.join(', '));
        } catch (e) {
          console.error('tools/list failed:', e.message);
        }

        console.log('metrics post:', await post(ep, {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'get_pipeline_metrics', arguments: {} },
        }));

        try {
          const metricsMsg = await waitFor(3);
          const text = metricsMsg.result?.content?.[0]?.text ?? JSON.stringify(metricsMsg.result);
          console.log('METRICS:', text.slice(0, 300));
        } catch (e) {
          console.error('metrics failed:', e.message);
        }

        req.destroy();
        resolve();
      });
    },
  );
  req.on('error', reject);
  setTimeout(() => reject(new Error('sse timeout')), 20000);
});
