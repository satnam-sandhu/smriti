#!/usr/bin/env node
/**
 * Exercise every Smriti MCP tool over local HTTP SSE.
 * Run: node scripts/test-all-mcp-tools.mjs
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP = process.env.MCP_URL ?? "http://localhost:3000";
const REPORT = join(ROOT, "samples/good/report_01.pdf");
const CLINICAL = join(ROOT, "samples/good/clinical_test.txt");
const BAD = join(ROOT, "samples/bad/corrupt_test.pdf");
const GOOD_DIR = join(ROOT, "samples/good");

const results = [];
let reqId = 10;
const pass = (n, d = "") => {
  results.push({ n, ok: true, d });
  console.log(`✓ ${n}${d ? ` — ${d}` : ""}`);
};
const fail = (n, e) => {
  const d = e instanceof Error ? e.message : String(e);
  results.push({ n, ok: false, d });
  console.error(`✗ ${n} — ${d}`);
};

async function withMcpSession(run) {
  const base = MCP.replace(/\/$/, "");
  const messages = [];
  const ctrl = new AbortController();

  const res = await fetch(`${base}/sse`, {
    headers: { Accept: "text/event-stream" },
    signal: ctrl.signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let endpoint = null;

  while (!endpoint) {
    const { done, value } = await reader.read();
    if (done) throw new Error("SSE closed before session");
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
      clientInfo: { name: "all-tools-test", version: "1.0" },
    },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  async function callTool(name, args = {}) {
    const id = ++reqId;
    await post({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
    const deadline = Date.now() + 120000;
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
      const hit = messages.find((m) => m.id === id);
      if (hit) {
        if (hit.error) throw new Error(hit.error.message);
        if (hit.result?.isError) {
          throw new Error(hit.result.content?.[0]?.text ?? "Tool error");
        }
        const text = (hit.result?.content ?? []).map((p) => p.text ?? "").join("\n").trim();
        try {
          return JSON.parse(text || "{}");
        } catch {
          return text;
        }
      }
    }
    throw new Error(`Timeout calling ${name}`);
  }

  async function listTools() {
    const id = ++reqId;
    await post({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
    const deadline = Date.now() + 15000;
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
      const hit = messages.find((m) => m.id === id);
      if (hit) return hit.result?.tools ?? [];
    }
    throw new Error("tools/list timeout");
  }

  try {
    return await run({ callTool, listTools });
  } finally {
    try {
      ctrl.abort();
    } catch {
      /* ignore */
    }
    void reader.cancel().catch(() => {});
  }
}

async function runTool(name, fn) {
  try {
    const out = await fn();
    const detail =
      typeof out === "object" && out !== null
        ? JSON.stringify(out).slice(0, 100)
        : String(out).slice(0, 100);
    pass(name, detail);
    return out;
  } catch (e) {
    fail(name, e);
    return null;
  }
}

console.log("\n=== All MCP Tools Test ===\n");
console.log(`MCP: ${MCP}`);
console.log(`ROOT: ${ROOT}\n`);

let docId = null;

await withMcpSession(async ({ callTool, listTools }) => {
  const tools = await listTools();
  const names = tools.map((t) => t.name).sort();
  pass("tools/list", `${names.length} tools: ${names.join(", ")}`);

  const expected = [
    "analytics_query",
    "classify_document",
    "execute_parser",
    "generate_parser",
    "get_document",
    "get_pipeline_metrics",
    "identify_template",
    "install_plugin",
    "list_failures",
    "list_plugins",
    "list_templates",
    "process_document",
    "search_documents",
    "upload_document",
    "upload_folder",
  ];
  for (const n of expected) {
    if (!names.includes(n)) fail(`tool registered: ${n}`, "missing from tools/list");
  }

  await runTool("install_plugin", () => callTool("install_plugin", { name: "finance" }));
  await runTool("list_plugins", () => callTool("list_plugins", {}));
  await runTool("get_pipeline_metrics", () => callTool("get_pipeline_metrics", {}));
  await runTool("list_templates", () => callTool("list_templates", {}));
  await runTool("identify_template", () =>
    callTool("identify_template", { file_path: REPORT }),
  );

  const upload = await runTool("upload_document (file_path)", () =>
    callTool("upload_document", { file_path: REPORT }),
  );
  if (upload?.documentId) docId = upload.documentId;

  const b64 = readFileSync(CLINICAL).toString("base64");
  await runTool("upload_document (base64)", () =>
    callTool("upload_document", {
      content: b64,
      filename: "clinical_test.txt",
      mimeType: "text/plain",
    }),
  );

  await runTool("upload_folder", () =>
    callTool("upload_folder", { folder_path: GOOD_DIR }),
  );

  if (docId) {
    await runTool("get_document", () => callTool("get_document", { documentId: docId }));
  await runTool("classify_document", () =>
    callTool("classify_document", { documentId: docId }),
  );
  await runTool("classify_document (file_path)", () =>
    callTool("classify_document", { file_path: REPORT }),
  );
  await runTool("classify_document (missing id → clear error)", async () => {
    try {
      await callTool("classify_document", {});
      throw new Error("expected error");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("documentId") && !msg.includes("file_path")) throw e;
      return { error: msg.slice(0, 80) };
    }
  });
    await runTool("process_document", () =>
      callTool("process_document", { documentId: docId }),
    );
  } else {
    fail("get_document", "skipped — no documentId");
    fail("classify_document", "skipped — no documentId");
    fail("process_document", "skipped — no documentId");
  }

  await runTool("search_documents", () =>
    callTool("search_documents", { query: "report" }),
  );

  await runTool("execute_parser", () =>
    callTool("execute_parser", { file_path: REPORT }),
  );

  await runTool("generate_parser", () =>
    callTool("generate_parser", { file_path: CLINICAL }),
  );

  await runTool("upload_document (bad file)", () =>
    callTool("upload_document", { file_path: BAD }),
  );

  await runTool("list_failures", () => callTool("list_failures", {}));

  await runTool("analytics_query", () =>
    callTool("analytics_query", {
      sql: "SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5",
    }),
  );
});

console.log("\n=== Summary ===");
const ok = results.filter((r) => r.ok).length;
const bad = results.filter((r) => !r.ok).length;
console.log(`${ok} passed, ${bad} failed out of ${results.length}\n`);
process.exit(bad > 0 ? 1 : 0);
