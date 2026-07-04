/**
 * /api/threads/[...path]
 *
 * Transparent proxy that forwards NitroChat thread API requests to the
 * gateway while keeping the API key server-side.
 *
 * Supported calls (mirrors gateway /v1/nitrochat/* endpoints):
 *   POST /api/threads/actor/resolve
 *   POST /api/threads/threads/resolve
 *   GET  /api/threads/threads/:threadId/messages
 *   POST /api/threads/threads/:threadId/messages
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getNitrochatGatewayApiKey,
  getNitrochatGatewayEndpoint,
} from '@/lib/gateway-env';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function handleRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const threadsEnabled =
    process.env['NEXT_PUBLIC_THREADS_ENABLED'] === 'true' ||
    process.env['THREADS_ENABLED'] === 'true';

  if (!threadsEnabled) {
    return NextResponse.json({ error: 'Thread persistence is not enabled' }, { status: 503 });
  }

  const gatewayEndpoint = getNitrochatGatewayEndpoint();
  const gatewayApiKey = getNitrochatGatewayApiKey();

  if (!gatewayEndpoint || !gatewayApiKey) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 });
  }

  const { path } = await context.params;
  const segments = path.join('/');
  const targetUrl = `${gatewayEndpoint}/v1/nitrochat/${segments}`;

  const { searchParams } = request.nextUrl;
  const qs = searchParams.toString();
  const fullUrl = qs ? `${targetUrl}?${qs}` : targetUrl;

  const headers: Record<string, string> = {
    'X-API-Key': gatewayApiKey,
  };

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await request.text();
      headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const upstream = await fetch(fullUrl, {
      method: request.method,
      headers,
      body,
    });

    const responseText = await upstream.text();

    if (!upstream.ok) {
      console.error(`[threads-proxy] ${request.method} /${segments} → ${upstream.status}:`, responseText);
      return NextResponse.json(
        { error: `Gateway error ${upstream.status}`, detail: responseText },
        { status: upstream.status },
      );
    }

    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json(responseData, { status: upstream.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[threads-proxy] ${request.method} /${segments} fetch error:`, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
