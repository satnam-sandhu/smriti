import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  MCP_SERVER_URL,
  NITROCHAT_CHAT_API,
  NITROCHAT_EMBED_URL,
} from "../../shared/constants";
import { callMcpTool, listMcpTools, type McpTool } from "../lib/mcp-client";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

const QUICK_TOOLS: Array<{ name: string; label: string; args?: Record<string, unknown> }> = [
  { name: "get_pipeline_metrics", label: "Pipeline metrics" },
  { name: "list_plugins", label: "List plugins" },
  { name: "install_plugin", label: "Install finance", args: { name: "finance" } },
  { name: "list_templates", label: "List templates" },
  { name: "list_failures", label: "List failures" },
];

function matchToolPrompt(text: string): { name: string; args: Record<string, unknown> } | null {
  const q = text.toLowerCase();
  if (q.includes("metric") || q.includes("pipeline")) {
    return { name: "get_pipeline_metrics", args: {} };
  }
  if (q.includes("plugin")) return { name: "list_plugins", args: {} };
  if (q.includes("template")) return { name: "list_templates", args: {} };
  if (q.includes("fail")) return { name: "list_failures", args: {} };
  if (q.includes("install") && q.includes("finance")) {
    return { name: "install_plugin", args: { name: "finance" } };
  }
  return null;
}

async function askNitroChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(NITROCHAT_CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content })),
      provider: "gateway",
    }),
  });
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "No response from NitroChat.";
}

export function ChatBotView() {
  const [tools, setTools] = useState<McpTool[]>([]);
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null);
  const [showMcp, setShowMcp] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "Smriti Chat — connected to production MCP. Use quick tools or ask about metrics, plugins, and templates.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listMcpTools(MCP_SERVER_URL);
        if (!cancelled) {
          setTools(list);
          setMcpOnline(list.length > 0);
        }
      } catch {
        if (!cancelled) setMcpOnline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const append = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, content }]);
  }, []);

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown> = {}, label?: string) => {
      setBusy(true);
      append("user", label ?? `Run tool: ${name}`);
    try {
      const result = await callMcpTool(MCP_SERVER_URL, name, args);
      append("assistant", result);
    } catch (err) {
      append(
        "assistant",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  },
  [append],
);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    append("user", text);

    try {
      const tool = matchToolPrompt(text);
      if (tool) {
        const result = await callMcpTool(MCP_SERVER_URL, tool.name, tool.args);
        append("assistant", result);
      } else {
        const history = [...messages, { id: "tmp", role: "user" as const, content: text }];
        const reply = await askNitroChat(history);
        append("assistant", reply);
      }
    } catch (err) {
      append(
        "assistant",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setBusy(false);
    }
  }, [append, busy, input, messages]);

  return (
    <div className="chatbot-layout">
      <aside className={`chatbot-mcp-panel ${showMcp ? "open" : "collapsed"}`}>
        <div className="chatbot-mcp-header">
          <div>
            <h3>MCP Tools</h3>
            <p className="chatbot-mcp-url">{MCP_SERVER_URL.replace("https://", "")}</p>
          </div>
          <span className={`chatbot-mcp-status ${mcpOnline ? "online" : "offline"}`}>
            {mcpOnline === null ? "…" : mcpOnline ? `${tools.length} tools` : "Offline"}
          </span>
        </div>

        <div className="chatbot-quick-tools">
          {QUICK_TOOLS.map((t) => (
            <button
              key={t.name + (t.label ?? "")}
              type="button"
              className="chatbot-tool-chip"
              disabled={busy}
              onClick={() => runTool(t.name, t.args ?? {}, t.label)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ul className="chatbot-tool-list">
          {tools.map((t) => (
            <li key={t.name}>
              <button
                type="button"
                className="chatbot-tool-item"
                disabled={busy}
                onClick={() => runTool(t.name, {}, t.name)}
                title={t.description}
              >
                <span className="chatbot-tool-name">{t.name}</span>
                {t.description && (
                  <span className="chatbot-tool-desc">{t.description.slice(0, 80)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chatbot-main">
        <div className="chatbot-toolbar">
          <button
            type="button"
            className="chatbot-toggle-mcp"
            onClick={() => setShowMcp((v) => !v)}
          >
            {showMcp ? "Hide MCP" : "Show MCP"}
          </button>
          <button
            type="button"
            className="chatbot-open-external"
            onClick={() => openUrl(NITROCHAT_EMBED_URL)}
          >
            Open NitroChat
          </button>
        </div>

        <div className="chatbot-messages" ref={scrollRef}>
          {messages.map((m) => (
            <div key={m.id} className={`chatbot-msg chatbot-msg-${m.role}`}>
              <div className="chatbot-msg-label">
                {m.role === "user" ? "You" : m.role === "assistant" ? "Smriti" : "System"}
              </div>
              <pre className="chatbot-msg-body">{m.content}</pre>
            </div>
          ))}
          {busy && <div className="chatbot-msg chatbot-msg-assistant chatbot-typing">Thinking…</div>}
        </div>

        <form
          className="chatbot-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className="chatbot-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about metrics, plugins, templates…"
            disabled={busy}
          />
          <button type="submit" className="chatbot-send" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
