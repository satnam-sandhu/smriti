import { NextRequest, NextResponse } from 'next/server';

// In-memory session store (same as SSE route)
const sessions = new Map<string, { serverUrl: string; createdAt: number }>();

/**
 * Proxy route for MCP message endpoint
 * This proxies POST requests to the actual MCP server's /mcp/message endpoint
 */
export async function POST(request: NextRequest) {
  try {
    // Get sessionId from query parameter or header
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId') || request.headers.get('X-MCP-Session-Id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
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
    const messageUrl = `${mcpServerUrl}/mcp/message`;

    // Get the request body
    const body = await request.text();

    // Forward the request to the MCP server
    const response = await fetch(messageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(
          Array.from(request.headers.entries()).filter(([key]) => 
            !['host', 'content-length'].includes(key.toLowerCase())
          )
        ),
      },
      body,
    });

    // Return the response from the MCP server
    const responseText = await response.text();
    
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('[MCP Message Proxy] Error:', error);
    return NextResponse.json(
      { error: `Proxy error: ${error.message}` },
      { status: 500 }
    );
  }
}


