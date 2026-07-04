import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/nitrochat.config';
import {
  getNitrochatGatewayApiKey,
  getNitrochatGatewayEndpoint,
  isNitrochatGatewayConfigured,
} from '@/lib/gateway-env';
import { getEndUserGatewayHeaders } from '@/lib/end-user-gateway';

const config = getConfig();

const MODEL_SELECTION_ENABLED = process.env.NITROCHAT_MODEL_SELECTION === 'true';
/** When model selection is off, all gateway requests use this model (OpenRouter id). */
const NITROCHAT_FIXED_MODEL = (process.env.NITROCHAT_MODEL || '').trim() || 'openrouter/auto';
const FOCUS_MODE = process.env.FOCUS_MODE === 'true' || process.env.NEXT_PUBLIC_FOCUS_MODE === 'true';

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  toolName?: string;
  imageData?: { base64: string; mimeType: string };
  result?: any; // Tool result data
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string; // Model selection (when enabled)
  mcpTools?: any[];
  mcpPrompts?: any[];
  mcpResources?: any[];
  systemInstruction?: string; // Allow passing explicit system instruction (e.g. from MCP)
  /** Optional system prompt from runtime config; can be empty string (not applied when empty) */
  systemPrompt?: string;
  stream?: boolean; // Request streaming response (gateway only)
}

// Rate limiting (simple in-memory)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  if (!config.security.enableRateLimit) return true;

  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit || now > limit.resetAt) {
    rateLimits.set(ip, {
      count: 1,
      resetAt: now + 60000, // 1 minute
    });
    return true;
  }

  if (limit.count >= config.security.maxRequestsPerMinute) {
    return false;
  }

  limit.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {

    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body: ChatRequest = await request.json();
    const { messages, model, mcpTools, mcpPrompts, mcpResources, systemInstruction: extraSystemInstruction, systemPrompt: runtimeSystemPrompt, stream: wantStream } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing required field: messages' },
        { status: 400 }
      );
    }

    if (!isNitrochatGatewayConfigured()) {
      return NextResponse.json(
        { error: 'NitroChat Gateway is not configured. Set NITROCHAT_GATEWAY_ENDPOINT and NITROCHAT_GATEWAY_API_KEY.' },
        { status: 503 }
      );
    }

    // Determine the model to use: client-provided model only when selection is enabled; otherwise env NITROCHAT_MODEL (server-enforced).
    const selectedModel = MODEL_SELECTION_ENABLED
      ? (model || 'openrouter/auto')
      : NITROCHAT_FIXED_MODEL;

    // Use MCP data from request (sent from frontend)
    const mcpToolsList = mcpTools || [];
    const mcpPromptsList = mcpPrompts || [];
    const mcpResourcesList = mcpResources || [];

    // Create synthetic tools for prompts and resources
    const syntheticTools: any[] = [];

    if (mcpPromptsList.length > 0) {
      syntheticTools.push({
        name: 'list_prompts',
        description: 'List all available MCP prompts with their names, descriptions, and required arguments. Call this when user asks what prompts are available. After calling this, present the complete list of prompts to the user.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      });
      syntheticTools.push({
        name: 'execute_prompt',
        description: 'Execute an MCP prompt with given arguments. Returns the prompt result. After calling this, display the result to the user.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The name of the prompt to execute' },
            arguments: { type: 'object', description: 'Arguments to pass to the prompt (key-value pairs)' },
          },
          required: ['name'],
        },
      });
    }

    if (mcpResourcesList.length > 0) {
      syntheticTools.push({
        name: 'list_resources',
        description: 'List all available MCP resources with their URIs, names, descriptions, and mime types. Call this when user asks to see what resources are available. After calling this, present the complete list of resources to the user.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      });
      syntheticTools.push({
        name: 'read_resource',
        description: 'Read the contents of an MCP resource by its URI. Returns the full resource content. After calling this, display the resource content to the user.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'The URI of the resource to read (e.g., "widget://examples", "config://settings")' },
          },
          required: ['uri'],
        },
      });
    }

    const allTools = [...mcpToolsList, ...syntheticTools];

    // Core System Prompt from Studio
    let systemPromptContent = `You are an intelligent AI assistant with access to ${allTools.length} powerful tools via MCP (Model Context Protocol). Your goal is to help users by using these tools effectively.

**CORE PRINCIPLES FOR TOOL USAGE:**

1. **Be Proactive & Infer Context**: 
   - Infer obvious information instead of asking (e.g., "Bangalore" → Karnataka, India)
   - Use common sense defaults
   - Don't ask for information you can deduce from context

2. **Chain Tools Intelligently**: 
   - Use multiple tools in sequence to accomplish complex tasks
   - Example: login → fetch data → process → display results
   - Don't ask permission for each step in an obvious workflow

3. **Maintain Context Awareness**: 
   - Remember information from previous tool calls in THIS conversation
   - Extract and reuse data (IDs, names, values) from previous tool results
   - NEVER ask for information you already have from a previous tool call

4. **Use Smart Defaults**: 
   - Apply sensible default values when parameters are optional
   - Only ask for clarification when truly ambiguous

5. **Minimize User Friction**: 
   - Don't ask for every detail - use inference and defaults
   - Be conversational but efficient

6. **Handle Errors Gracefully**:
   - If authentication required, guide user to login if needed (auth is often auto-handled)
   - If operation fails, explain why and suggest alternatives

7. **Tool Call Best Practices**:
   - Read tool descriptions carefully
   - Use exact parameter names as specified in the schema
   - If a tool says "Requires authentication" - CALL IT ANYWAY! Auth is handled automatically
   - Don't ask for credentials preemptively

**AUTHENTICATION IS AUTOMATIC:**
- Authentication tokens are handled in the background
- Call tools DIRECTLY even if they say they require auth
- Only ask for login if a tool EXPLICITLY fails with an auth error

**PRESENTING RESULTS:**
- After calling ANY tool, you MUST present the results clearly to the user
- Convert raw JSON results into readable summaries, lists, or tables
- NEVER just say "I have the results" or "Done" - show the data!
`;

    // Focus mode: only answer within MCP/tools context; strict refusal for off-topic questions
    if (FOCUS_MODE) {
      systemPromptContent += `

**FOCUS MODE (STRICT - ENFORCED):**
- You must ONLY answer questions that can be answered using the available MCP tools. Do NOT answer general knowledge, mythology, philosophy, jokes, creative writing, or any topic outside the tools' scope.
- If the user asks something off-topic or vague (e.g. "What is god?", "Thor vs Zeus", "Tell me a joke"), you must REFUSE briefly. Reply in 1–2 sentences only: state that you can only help with tasks supported by the available tools and ask them to try a question within that scope.
- Do NOT offer to "reframe" the question, create "content briefs", "branding frameworks", or any alternative task based on the off-topic question. Do not list "Possible options" or suggest related deliverables. Just decline and redirect.
- Stay strictly on-topic: only use your tools and only answer what the tools and this app are designed for.
`;
    }

    // Append extra instruction if provided (e.g. from MCP 'system' prompt)
    if (extraSystemInstruction) {
      systemPromptContent += `\n\n**ADDITIONAL INSTRUCTIONS:**\n${extraSystemInstruction}`;
    }

    // Append runtime system prompt from runtime config (can be set and empty; only append when non-empty)
    if (runtimeSystemPrompt != null && runtimeSystemPrompt.trim() !== '') {
      systemPromptContent += `\n\n**RUNTIME SYSTEM PROMPT:**\n${runtimeSystemPrompt.trim()}`;
    }

    // Prepend system message if not already present
    const hasSystemMessage = messages.some((m: ChatMessage) => m.role === 'system');
    const messagesWithSystem = hasSystemMessage
      ? messages
      : [{ role: 'system' as const, content: systemPromptContent }, ...messages];

    const userHeaders = getEndUserGatewayHeaders(request);
    const response = await callGateway(
      messagesWithSystem,
      allTools,
      selectedModel,
      systemPromptContent,
      wantStream === true,
      userHeaders
    );

    if (response instanceof NextResponse) {
      return response;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('❌ Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Gateway Integration - Routes through NitroChat Gateway for usage tracking
// ============================================================================
/**
 * Append OpenRouter :nitro variant for throughput when supported.
 * Do not append if the model id already has a routing variant (e.g. :free, :online);
 * otherwise OpenRouter receives an invalid slug like google/...:free:nitro (404).
 * @see https://openrouter.ai/docs/guides/routing/model-variants/nitro
 */
const NITRO_SUPPORTED_MODELS = [
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1",
];

function supportsNitro(model: string): boolean {
  const base = model.split(":")[0];
  return NITRO_SUPPORTED_MODELS.includes(base);
}

function shouldUseNitro(model: string, tools?: any[]): boolean {
  // ❌ Never use with tools
  if (tools?.length) return false;

  // ❌ Avoid problematic families
  if (model.startsWith("anthropic/")) return false;
  if (model.includes("sora")) return false;
  if (model.includes("rerank")) return false;

  // ✅ Only allow known safe models
  return supportsNitro(model);
}

function modelWithNitro(model: string, tools?: any[]): string {
  if (!model) return model;

  // Already has suffix
  if (model.includes(":")) return model;

  if (!shouldUseNitro(model, tools)) return model;

  return `${model}:nitro`;
}

type GatewayMessage = {
  role: string;
  content?: unknown;
  tool_calls?: Array<{ id?: string; function?: { name?: string } }>;
  tool_call_id?: string;
};

/**
 * Production-safe tool-chain audit. Warns when an assistant `tool_calls[].id`
 * does not have a matching following `role: tool` row with the same
 * `tool_call_id` — the OpenAI tool-chain invariant whose violation reproduces
 * the AWLi repeated-tool-call symptom. No message content is logged.
 */
function auditToolChain(messages: GatewayMessage[]): void {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls) || m.tool_calls.length === 0) {
      continue;
    }
    const callIds = m.tool_calls.map((tc) => tc.id).filter((id): id is string => !!id);
    const followingToolIds: string[] = [];
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j]?.role !== 'tool') break;
      const id = messages[j]?.tool_call_id;
      if (id) followingToolIds.push(id);
    }
    const missing = callIds.filter((id) => !followingToolIds.includes(id));
    if (missing.length > 0 || callIds.length !== followingToolIds.length) {
      console.warn('[NitroChat] tool-chain mismatch before gateway', {
        assistantIndex: i,
        toolCallCount: callIds.length,
        followingToolRowCount: followingToolIds.length,
        missingResultIds: missing,
        toolNames: m.tool_calls.map((tc) => tc.function?.name).filter(Boolean),
      });
    }
  }
}

async function callGateway(
  messages: ChatMessage[],
  tools: any[],
  model: string,
  systemPrompt: string,
  stream: boolean = false,
  userHeaders: Record<string, string> = {}
): Promise<{ message: ChatMessage; toolCalls?: any[] } | NextResponse> {
  const gatewayBase = getNitrochatGatewayEndpoint();
  const gatewayKey = getNitrochatGatewayApiKey();
  const modelForRequest = modelWithNitro(model);

  // Convert messages to OpenAI-compatible format (which the gateway expects)
  const gatewayMessages = messages.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        tool_call_id: msg.toolCallId || '',
      };
    }
    if (msg.role === 'system') {
      return {
        role: 'system' as const,
        content: msg.content,
      };
    }
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant' as const,
        content: msg.content || '',
        tool_calls: msg.toolCalls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    // Handle image data
    if (msg.imageData) {
      return {
        role: msg.role,
        content: [
          { type: 'text', text: msg.content || '' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${msg.imageData.mimeType};base64,${msg.imageData.base64}`,
            },
          },
        ],
      };
    }

    return {
      role: msg.role,
      content: msg.content,
    };
  });

  auditToolChain(gatewayMessages);

  // Build gateway request body (OpenAI-compatible format)
  // Note: Don't send "provider" as a string — the gateway maps "provider" JSON field
  // to ProviderRoutingConfig (a struct). The gateway auto-defaults to OpenRouter.
  const gatewayBody: any = {
    model: modelForRequest,
    messages: gatewayMessages,
    stream,
    guardrails_enabled: false, // NitroChat is not Studio, disable guardrails
  };

  // Gateway strips client role=system messages when guardrails are off; pass NitroChat rules here.
  const trimmedSystem = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
  if (trimmedSystem) {
    gatewayBody.custom_system_prompt = trimmedSystem;
  }

  // Add tools if available
  if (tools.length > 0) {
    gatewayBody.tools = tools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
    gatewayBody.tool_choice = 'auto';
  }

  const gatewayUrl = `${gatewayBase}/v1/nitrochat/chat/completions`;

  const gatewayResponse = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': gatewayKey,
      ...userHeaders,
    },
    body: JSON.stringify(gatewayBody),
  });

  if (!gatewayResponse.ok) {
    const errorBody = await gatewayResponse.text();
    console.error(`❌ [Gateway] Error ${gatewayResponse.status}:`, errorBody);

    // Parse gateway error for credit exhaustion / auth errors
    try {
      const errorJson = JSON.parse(errorBody);

      // Pass through specific gateway errors
      if (gatewayResponse.status === 402 || errorJson.error?.code === 'CREDITS_EXHAUSTED') {
        return NextResponse.json(errorJson, { status: 402 }) as any;
      }

      if (gatewayResponse.status === 401 || errorJson.error?.code === 'INVALID_API_KEY') {
        return NextResponse.json(errorJson, { status: 401 }) as any;
      }

      throw new Error(errorJson.error?.message || `Gateway error: ${gatewayResponse.status}`);
    } catch (parseErr: any) {
      if (parseErr.message.includes('Gateway error')) {
        throw parseErr;
      }
      throw new Error(`Gateway error: ${gatewayResponse.status} - ${errorBody}`);
    }
  }

  // Streaming: forward the gateway stream to the client
  const contentType = gatewayResponse.headers.get('Content-Type') || '';
  if (stream && gatewayResponse.body && contentType.includes('text/event-stream')) {
    return new NextResponse(gatewayResponse.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  const data = await gatewayResponse.json();

  // Parse OpenAI-compatible response from gateway
  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error('No response from gateway');
  }

  const responseMessage = choice.message;
  const toolCalls: any[] = [];

  // Extract tool calls from response
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    for (const tc of responseMessage.tool_calls) {
      let args: Record<string, any> = {};
      try {
        args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
      } catch {
        args = {};
      }

      toolCalls.push({
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      });
    }
  }

  const result: { message: ChatMessage; toolCalls?: any[] } = {
    message: {
      role: 'assistant',
      content: responseMessage.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    },
  };

  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  return result;
}