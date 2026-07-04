import { invoke } from "@tauri-apps/api/core";

export interface McpTool {
  name: string;
  description?: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

type JsonRpcMessage = {
  jsonrpc: string;
  id?: number;
  result?: {
    tools?: McpTool[];
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { message: string };
};

function baseUrl(serverUrl: string): string {
  return serverUrl.replace(/\/$/, "");
}

function messageUrl(serverUrl: string, path: string): string {
  return path.startsWith("http") ? path : `${baseUrl(serverUrl)}${path}`;
}

async function mcpPost(serverUrl: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(messageUrl(serverUrl, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202 && res.status !== 200) {
    throw new Error(`MCP POST failed: ${res.status}`);
  }
}

function ingestSseChunk(chunk: string, messages: JsonRpcMessage[]) {
  for (const block of chunk.split("\n\n")) {
    const line = block.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (raw.startsWith("/mcp/")) continue;
    try {
      messages.push(JSON.parse(raw) as JsonRpcMessage);
    } catch {
      /* ignore */
    }
  }
}

function waitForId(messages: JsonRpcMessage[], id: number, ms = 30000): Promise<JsonRpcMessage> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const hit = messages.find((m) => m.id === id);
      if (hit) return resolve(hit);
      if (Date.now() - start > ms) {
        return reject(new Error(`MCP timeout waiting for response (id=${id})`));
      }
      setTimeout(check, 80);
    };
    check();
  });
}

async function withMcpSessionBrowser<T>(
  serverUrl: string,
  run: (ctx: { endpoint: string; messages: JsonRpcMessage[] }) => Promise<T>,
): Promise<T> {
  const messages: JsonRpcMessage[] = [];
  const abort = new AbortController();

  const res = await fetch(`${baseUrl(serverUrl)}/sse`, {
    headers: { Accept: "text/event-stream" },
    signal: abort.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`MCP SSE connect failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let endpoint: string | null = null;

  const endpointReady = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MCP SSE connection timed out")), 30000);

    void (async () => {
      try {
        while (!endpoint) {
          const { done, value } = await reader.read();
          if (done) throw new Error("MCP SSE stream closed before session ready");
          buf += decoder.decode(value, { stream: true });
          ingestSseChunk(buf, messages);
          const sid = buf.match(/sessionId=([a-f0-9-]+)/)?.[1];
          if (sid) {
            endpoint = `/mcp/messages?sessionId=${sid}`;
            clearTimeout(timer);
            resolve(endpoint);
            break;
          }
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          ingestSseChunk(buf, messages);
        }
      } catch (err) {
        if (!endpoint) {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();
  });

  const ep = await endpointReady;

  await mcpPost(serverUrl, ep, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smriti-desktop", version: "1.0" },
    },
  });
  await mcpPost(serverUrl, ep, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  });

  try {
    return await run({ endpoint: ep, messages });
  } finally {
    abort.abort();
    void reader.cancel();
  }
}

async function listMcpToolsBrowser(serverUrl: string): Promise<McpTool[]> {
  return withMcpSessionBrowser(serverUrl, async ({ endpoint, messages }) => {
    const reqId = 2;
    await mcpPost(serverUrl, endpoint, {
      jsonrpc: "2.0",
      id: reqId,
      method: "tools/list",
      params: {},
    });
    const msg = await waitForId(messages, reqId);
    return msg.result?.tools ?? [];
  });
}

async function callMcpToolBrowser(
  serverUrl: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  return withMcpSessionBrowser(serverUrl, async ({ endpoint, messages }) => {
    const reqId = 3;
    await mcpPost(serverUrl, endpoint, {
      jsonrpc: "2.0",
      id: reqId,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const msg = await waitForId(messages, reqId, 45000);
    if (msg.error) throw new Error(msg.error.message);
    if (msg.result?.isError) {
      throw new Error(msg.result.content?.[0]?.text ?? "Tool failed");
    }
    const text = (msg.result?.content ?? []).map((p) => p.text ?? "").join("\n").trim();
    return text || JSON.stringify(msg.result, null, 2);
  });
}

export async function listMcpTools(serverUrl: string): Promise<McpTool[]> {
  if (isTauri()) {
    return invoke<McpTool[]>("mcp_list_tools", { serverUrl });
  }
  return listMcpToolsBrowser(serverUrl);
}

export async function callMcpTool(
  serverUrl: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  if (isTauri()) {
    return invoke<string>("mcp_call_tool", { serverUrl, name, args });
  }
  return callMcpToolBrowser(serverUrl, name, args);
}

export async function pingMcpServer(serverUrl: string): Promise<boolean> {
  try {
    const tools = await listMcpTools(serverUrl);
    return tools.length > 0;
  } catch {
    return false;
  }
}
