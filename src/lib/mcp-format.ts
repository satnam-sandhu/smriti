/** Format MCP tool results and errors for the desktop chat UI. */

export interface ToolArgHint {
  summary: string;
  example?: Record<string, unknown>;
}

/** Tools that accept empty `{}` when invoked from the sidebar. */
export const TOOLS_NO_ARGS = new Set([
  "get_pipeline_metrics",
  "list_plugins",
  "list_templates",
  "list_failures",
]);

/** Tools that need parameters — show guidance instead of calling with `{}`. */
export const TOOL_ARG_HINTS: Record<string, ToolArgHint> = {
  classify_document: {
    summary: "Needs documentId (from upload_document) or file_path.",
    example: { file_path: "/path/to/document.pdf" },
  },
  get_document: {
    summary: "Needs documentId from upload_document or search_documents.",
    example: { documentId: "<uuid-from-upload>" },
  },
  process_document: {
    summary: "Needs documentId from upload_document or search_documents.",
    example: { documentId: "<uuid-from-upload>" },
  },
  upload_document: {
    summary: "Needs file_path or content + filename.",
    example: { file_path: "/path/to/document.pdf" },
  },
  upload_folder: {
    summary: "Needs folder_path pointing at a directory of documents.",
    example: { folder_path: "/path/to/folder" },
  },
  identify_template: {
    summary: "Needs file_path to the document on disk.",
    example: { file_path: "/path/to/document.pdf" },
  },
  generate_parser: {
    summary: "Needs file_path to the document on disk.",
    example: { file_path: "/path/to/document.pdf" },
  },
  execute_parser: {
    summary: "Needs file_path to the document on disk.",
    example: { file_path: "/path/to/document.pdf" },
  },
  search_documents: {
    summary: "Needs a search query string.",
    example: { query: "report" },
  },
  analytics_query: {
    summary: "Needs SQL against Gold Parquet.",
    example: { sql: "SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5" },
  },
  install_plugin: {
    summary: "Needs plugin name: healthcare or finance.",
    example: { name: "finance" },
  },
};

export function toolNeedsArgs(name: string, args: Record<string, unknown>): boolean {
  if (TOOLS_NO_ARGS.has(name)) return false;
  if (Object.keys(args).length > 0) return false;
  return Boolean(TOOL_ARG_HINTS[name]);
}

export function toolArgGuidance(name: string): string {
  const hint = TOOL_ARG_HINTS[name];
  if (!hint) {
    return `Tool "${name}" requires arguments. Ask in chat with details (e.g. file path or document ID).`;
  }
  const example = hint.example
    ? `\n\nExample:\n${JSON.stringify(hint.example, null, 2)}`
    : "";
  return `${hint.summary}${example}`;
}

export function cleanMcpErrorMessage(raw: string): string {
  let msg = raw.trim();
  const prefix = msg.match(/^Error executing tool '[^']+':\s*/i);
  if (prefix) msg = msg.slice(prefix[0].length);
  if (msg.startsWith("Error: ")) msg = msg.slice(7);
  return msg.trim() || "Tool call failed.";
}

export function formatMcpResponse(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "(empty response)";

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return formatStructuredValue(parsed);
  } catch {
    return trimmed;
  }
}

function formatStructuredValue(data: unknown): string {
  if (data == null) return "(no data)";
  if (typeof data === "string") return data;
  if (typeof data !== "object") return String(data);

  const obj = data as Record<string, unknown>;
  if (typeof obj.error === "string") return `Error: ${obj.error}`;

  if ("totalFiles" in obj || "total_files" in obj) {
    return formatMetrics(obj);
  }
  if ("plugins" in obj && Array.isArray(obj.plugins)) {
    const lines = (obj.plugins as Array<{ name?: string; status?: string; active?: boolean }>).map(
      (p) => `• ${p.name ?? "plugin"}${p.active ? " (active)" : ""} — ${p.status ?? "unknown"}`,
    );
    return `Plugins (${lines.length})\n${lines.join("\n")}`;
  }
  if ("templates" in obj && Array.isArray(obj.templates)) {
    const lines = (obj.templates as Array<{ templateId?: string; documentType?: string; name?: string }>).slice(0, 10).map(
      (t) => `• ${t.templateId ?? t.name ?? "template"} — ${t.documentType ?? ""}`,
    );
    const extra = (obj.templates as unknown[]).length > 10 ? `\n… and ${(obj.templates as unknown[]).length - 10} more` : "";
    return `Templates (${(obj.templates as unknown[]).length})\n${lines.join("\n")}${extra}`;
  }
  if ("failures" in obj && Array.isArray(obj.failures)) {
    const failures = obj.failures as Array<{ file_name?: string; error_code?: string; error_detail?: string }>;
    if (failures.length === 0) return "No quarantined failures.";
    return failures
      .slice(0, 8)
      .map((f) => `• ${f.file_name ?? "file"} — ${f.error_code ?? "error"}: ${f.error_detail ?? ""}`)
      .join("\n");
  }
  if ("results" in obj && Array.isArray(obj.results)) {
    const results = obj.results as Array<{ documentId?: string; score?: number; metadata?: { filename?: string } }>;
    if (results.length === 0) return "No matching documents.";
    return results
      .slice(0, 8)
      .map((r) => `• ${r.metadata?.filename ?? r.documentId ?? "doc"} (score ${r.score ?? "—"})`)
      .join("\n");
  }

  return JSON.stringify(data, null, 2);
}

function formatMetrics(m: Record<string, unknown>): string {
  const lines = [
    `Total files: ${m.totalFiles ?? m.total_files ?? 0}`,
    `Completed: ${m.completed ?? 0}`,
    `Failed: ${m.failed ?? 0}`,
    `In progress: ${m.inProgress ?? m.in_progress ?? 0}`,
  ];
  if (m.totalBytes != null || m.total_bytes != null) {
    lines.push(`Total bytes: ${m.totalBytes ?? m.total_bytes}`);
  }
  if (m.aiParsed != null || m.ai_parsed != null) {
    lines.push(`AI parsed: ${m.aiParsed ?? m.ai_parsed}`);
  }
  if (m.deterministicParsed != null || m.deterministic_parsed != null) {
    lines.push(`Deterministic: ${m.deterministicParsed ?? m.deterministic_parsed}`);
  }
  return `Pipeline metrics\n${lines.map((l) => `• ${l}`).join("\n")}`;
}
