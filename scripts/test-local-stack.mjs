#!/usr/bin/env node
/** Smoke test: local MCP (:3000) + NitroChat (:3003) + NitroStack gateway LLM. */
const MCP = process.env.MCP_URL ?? "http://localhost:3000";
const CHAT = process.env.NITROCHAT_URL ?? "http://localhost:3003";

const results = [];
const pass = (n, d = "") => {
  results.push({ n, ok: true, d });
  console.log(`✓ ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, e) => {
  const d = e instanceof Error ? e.message : String(e);
  results.push({ n, ok: false, d });
  console.error(`✗ ${n} — ${d}`);
};

async function req(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 45000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, text, json: text ? JSON.parse(text) : null };
  } finally {
    clearTimeout(t);
  }
}

async function mcpToolsList() {
  const base = MCP.replace(/\/$/, "");
  const messages = [];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  const res = await fetch(`${base}/sse`, {
    headers: { Accept: "text/event-stream" },
    signal: ctrl.signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let endpoint = null;

  while (!endpoint) {
    const { done, value } = await reader.read();
    if (done) throw new Error("SSE closed before session");
    buf += dec.decode(value, { stream: true });
    for (const block of buf.split("\n\n")) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (raw.startsWith("/mcp/")) continue;
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
    const sid = buf.match(/sessionId=([a-f0-9-]+)/)?.[1];
    if (sid) endpoint = `${base}/mcp/messages?sessionId=${sid}`;
  }

  async function post(body) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok && r.status !== 202) throw new Error(`POST ${r.status}`);
  }

  await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "local-stack-test", version: "1.0" },
    },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const block of buf.split("\n\n")) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (raw.startsWith("/mcp/")) continue;
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
    const hit = messages.find((m) => m.id === 2);
    if (hit) {
      clearTimeout(t);
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
      void reader.cancel().catch(() => {});
      return hit.result?.tools ?? [];
    }
  }
  throw new Error("tools/list timeout");
}

console.log("\n=== Local Stack Test ===\n");
console.log(`MCP:  ${MCP}`);
console.log(`Chat: ${CHAT}\n`);

try {
  const tools = await mcpToolsList();
  if (tools.length === 0) throw new Error("no tools");
  pass("Local MCP SSE + tools/list", `${tools.length} tools`);
  if (!tools.some((t) => t.name === "get_pipeline_metrics")) {
    throw new Error("get_pipeline_metrics missing");
  }
  pass("MCP tool catalog", "get_pipeline_metrics present");
} catch (e) {
  fail("Local MCP SSE + tools/list", e);
}

try {
  const { status, json } = await req(`${CHAT}/api/config`, { timeout: 10000 });
  if (status !== 200) throw new Error(`HTTP ${status}`);
  const mcpUrl = json?.mcp?.serverUrl ?? "";
  const gw = json?.gateway ?? {};
  if (!mcpUrl.includes("localhost:3000")) throw new Error(`MCP URL=${mcpUrl}`);
  if (!gw.enabled) throw new Error("gateway not enabled");
  pass("NitroChat /api/config", `MCP=${mcpUrl}, gateway=${gw.endpoint ?? "ok"}`);
} catch (e) {
  fail("NitroChat /api/config", e);
}

try {
  const { status, json } = await req(`${CHAT}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Reply with exactly: LOCAL_GATEWAY_OK" }],
      provider: "gateway",
    }),
    timeout: 60000,
  });
  if (status !== 200) throw new Error(json?.error ?? `HTTP ${status}`);
  const text = json?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty reply");
  pass("NitroChat /api/chat (gateway LLM)", text.slice(0, 80));
} catch (e) {
  fail("NitroChat /api/chat (gateway LLM)", e);
}

console.log("\n=== Summary ===");
const ok = results.filter((r) => r.ok).length;
const bad = results.filter((r) => !r.ok).length;
console.log(`${ok} passed, ${bad} failed out of ${results.length}\n`);
process.exit(bad > 0 ? 1 : 0);
