/** Format MCP tool results and errors for the desktop chat UI. */

export interface ToolArgHint {
  summary: string;
  example?: Record<string, unknown>;
}

const SAMPLE_REPORT = "samples/good/report_01.pdf";
const SAMPLE_FOLDER = "samples/good";

function joinRoot(root: string, relative: string): string {
  return `${root.replace(/\/$/, "")}/${relative}`;
}

/** Default args when a sidebar tool is clicked with no parameters. */
export function defaultToolArgs(
  name: string,
  smritiRoot: string,
): Record<string, unknown> {
  const report = joinRoot(smritiRoot, SAMPLE_REPORT);
  const folder = joinRoot(smritiRoot, SAMPLE_FOLDER);

  switch (name) {
    case "get_pipeline_metrics":
    case "list_plugins":
    case "list_templates":
    case "list_failures":
      return {};
    case "install_plugin":
      return { name: "finance" };
    case "search_documents":
      return { query: "report" };
    case "analytics_query":
      return { sql: "SELECT * FROM read_parquet('GOLD_GLOB') LIMIT 5" };
    case "upload_folder":
      return { folder_path: folder };
    case "upload_document":
    case "identify_template":
    case "generate_parser":
    case "execute_parser":
    case "classify_document":
      return { file_path: report };
    default:
      return {};
  }
}

export function mergeToolArgs(
  name: string,
  args: Record<string, unknown>,
  smritiRoot: string,
): Record<string, unknown> {
  if (Object.keys(args).length > 0) return args;
  return defaultToolArgs(name, smritiRoot);
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
  if ("documentId" in obj && "status" in obj) {
    const r = obj as Record<string, unknown>;
    return [
      `Document: ${r.documentId}`,
      `Status: ${r.status}`,
      r.parserPath ? `Parser: ${r.parserPath}` : null,
      r.documentType ? `Type: ${r.documentType}` : null,
    ]
      .filter(Boolean)
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
