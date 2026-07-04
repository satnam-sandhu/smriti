import type { ToolCall } from '@/lib/store';

/** Minimal MCP client surface used for chat tool execution. */
export type McpClientLike = {
  listPrompts: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
  listResources: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
  readResource: (uri: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  getPrompt: (name: string, args?: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }>;
};

export async function runMcpToolCall(
  client: McpClientLike,
  toolCall: Pick<ToolCall, 'name' | 'arguments'>,
): Promise<unknown> {
  try {
    if (toolCall.name === 'list_prompts') {
      const response = await client.listPrompts();
      return response.success ? response.data : { error: response.error };
    }
    if (toolCall.name === 'list_resources') {
      const response = await client.listResources();
      return response.success ? response.data : { error: response.error };
    }
    if (toolCall.name === 'read_resource') {
      const response = await client.readResource(toolCall.arguments.uri);
      return response.success ? response.data : { error: response.error };
    }
    if (toolCall.name === 'execute_prompt') {
      const response = await client.getPrompt(
        toolCall.arguments.name,
        toolCall.arguments.arguments,
      );
      return response.success ? response.data : { error: response.error };
    }
    const response = await client.callTool(toolCall.name, toolCall.arguments ?? {});
    return response.success ? response.data : { error: response.error };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message };
  }
}
