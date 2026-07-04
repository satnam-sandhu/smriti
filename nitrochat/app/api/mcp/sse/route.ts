import { NextRequest, NextResponse } from 'next/server';

// In-memory session store (in production, use Redis or similar)
const sessions = new Map<string, { serverUrl: string; createdAt: number }>();

// Clean up old sessions (older than 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > 5 * 60 * 1000) {
      sessions.delete(sessionId);
    }
  }
}, 60000); // Run every minute

/**
 * Create a session for MCP server connection
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serverUrl } = body;

    if (!serverUrl) {
      return NextResponse.json(
        { error: 'serverUrl is required' },
        { status: 400 }
      );
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    sessions.set(sessionId, {
      serverUrl,
      createdAt: Date.now(),
    });

    return NextResponse.json({ sessionId });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to create session: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * Proxy route for MCP SSE connection
 * This allows NitroChat to connect to MCP servers on different subdomains
 * by proxying the SSE connection through the same-origin API route
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const clientId = searchParams.get('clientId') || `client_${Date.now()}`;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter is required' },
        { status: 400 }
      );
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 404 }
      );
    }

    const mcpServerUrl = session.serverUrl;

    // Build the SSE endpoint URL
    const sseUrl = `${mcpServerUrl}/mcp/sse?clientId=${clientId}`;

    // Fetch the SSE stream from the MCP server
    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to connect to MCP server: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Create a transform stream to rewrite the 'endpoint' event in the SSE stream
    // The SDK validates that the endpoint origin matches the connection origin
    // The MCP server sends: event: endpoint\ndata: <actual-server-url>/mcp/message
    // We need to rewrite it to: event: endpoint\ndata: <proxy-url>/api/mcp/message
    const proxyBaseUrl = request.nextUrl.origin;
    let buffer = '';
    
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        buffer += new TextDecoder().decode(chunk);
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        let inEndpointEvent = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.startsWith('event: endpoint')) {
            inEndpointEvent = true;
            controller.enqueue(new TextEncoder().encode(line + '\n'));
          } else if (inEndpointEvent && line.startsWith('data: ')) {
            // Rewrite the endpoint URL to use our proxy
            const endpointUrl = line.substring(6); // Remove 'data: ' prefix
            try {
              const url = new URL(endpointUrl);
              // Replace the MCP server URL with our proxy URL
              const proxyEndpoint = endpointUrl.replace(mcpServerUrl, proxyBaseUrl);
              // Also replace /mcp/message with /api/mcp/message?sessionId=xxx for the proxy
              const rewrittenEndpoint = proxyEndpoint.replace('/mcp/message', `/api/mcp/message?sessionId=${sessionId}`);
              controller.enqueue(new TextEncoder().encode(`data: ${rewrittenEndpoint}\n`));
              inEndpointEvent = false;
            } catch (e) {
              // If URL parsing fails, just pass through
              controller.enqueue(new TextEncoder().encode(line + '\n'));
              inEndpointEvent = false;
            }
          } else {
            controller.enqueue(new TextEncoder().encode(line + '\n'));
            if (line === '') {
              inEndpointEvent = false; // Reset on empty line (SSE event separator)
            }
          }
        }
      },
      flush(controller) {
        if (buffer) {
          controller.enqueue(new TextEncoder().encode(buffer));
        }
      },
    });

    // Pipe the response through the transform stream
    response.body?.pipeThrough(transformStream);

    // Return the transformed SSE stream
    const headers = new Headers();
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');
    headers.set('X-Accel-Buffering', 'no');

    return new NextResponse(transformStream.readable, {
      headers,
    });
  } catch (error: any) {
    console.error('[MCP SSE Proxy] Error:', error);
    return NextResponse.json(
      { error: `Proxy error: ${error.message}` },
      { status: 500 }
    );
  }
}

