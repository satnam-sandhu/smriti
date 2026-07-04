import { NextRequest, NextResponse } from 'next/server';
import {
  getNitrochatGatewayApiKey,
  getNitrochatGatewayEndpoint,
} from '@/lib/gateway-env';

/**
 * GET /api/gateway/models
 * Fetches available models from the NitroChat Gateway.
 * Only accessible when NITROCHAT_GATEWAY_ENDPOINT and NITROCHAT_GATEWAY_API_KEY are configured.
 */
export async function GET(request: NextRequest) {
    const gatewayEndpoint = getNitrochatGatewayEndpoint();
    const gatewayApiKey = getNitrochatGatewayApiKey();

    if (!gatewayEndpoint || !gatewayApiKey) {
        return NextResponse.json(
            { error: 'Gateway not configured' },
            { status: 503 }
        );
    }

    try {
        const response = await fetch(`${gatewayEndpoint}/v1/nitrochat/models/available`, {
            headers: {
                'X-API-Key': gatewayApiKey,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Gateway Models] Error ${response.status}:`, errorText);
            return NextResponse.json(
                { error: `Failed to fetch models from gateway: ${response.status}` },
                { status: response.status }
            );
        }

        const models = await response.json();
        return NextResponse.json(models);
    } catch (error: any) {
        console.error('[Gateway Models] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch gateway models' },
            { status: 500 }
        );
    }
}
