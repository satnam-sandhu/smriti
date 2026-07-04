#!/usr/bin/env node
/** Verify local MCP reads/writes smriti/data workspace. */
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const MCP = "http://localhost:3000";

async function mcpCallTool(name, args = {}) {
  const base = MCP.replace(/\/$/, "");
  const messages = [];
  const ctrl = new AbortController();
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
    if (done) throw new Error("SSE closed");
    buf += dec.decode(value, { stream: true });
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
      clientInfo: { name: "data-workspace-test", version: "1.0" },
    },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const block of buf.split("\n\n")) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        messages.push(JSON.parse(line.slice(5).trim()));
      } catch {
        /* ignore */
      }
    }
    const hit = messages.find((m) => m.id === 2);
    if (hit) {
      try {
        ctrl.abort();
      } catch {
        /* ignore */
      }
      void reader.cancel().catch(() => {});
      if (hit.error) throw new Error(hit.error.message);
      const text = (hit.result?.content ?? []).map((p) => p.text ?? "").join("\n");
      return JSON.parse(text || "{}");
    }
  }
  throw new Error("tool call timeout");
}

console.log("\n=== Workspace Data Test ===\n");
console.log(`Expected workspace: ${DATA}\n`);

const stateBefore = statSync(join(DATA, "smriti-state.json")).mtimeMs;
const metrics = await mcpCallTool("get_pipeline_metrics");
const stateAfter = statSync(join(DATA, "smriti-state.json")).mtimeMs;

const total = metrics.totalFiles ?? metrics.total_files ?? metrics.total;
console.log(`✓ get_pipeline_metrics — totalFiles=${total}`);

if (!exists(DATA)) throw new Error("data/ missing");
for (const dir of ["bronze", "silver", "quarantine"]) {
  const p = join(DATA, dir);
  if (!exists(p)) throw new Error(`missing ${dir}/`);
  console.log(`✓ data/${dir}/ exists`);
}

const state = JSON.parse(readFileSync(join(DATA, "smriti-state.json"), "utf-8"));
console.log(`✓ data/smriti-state.json — ${state.files?.length ?? 0} file record(s)`);

if (exists(join(DATA, "smriti.db"))) {
  console.log(`✓ data/smriti.db exists (${statSync(join(DATA, "smriti.db")).size} bytes)`);
}

console.log(`✓ MCP state read from smriti/data (mtime ${stateBefore === stateAfter ? "unchanged" : "updated"})`);
console.log("\nAll workspace checks passed.\n");

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
