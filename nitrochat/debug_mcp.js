import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';
// Polyfill EventSource
global.EventSource = EventSource;
async function main() {
    const serverUrl = 'http://localhost:3000/mcp/sse';
    const transport = new SSEClientTransport(new URL(serverUrl));
    const client = new Client(
        { name: 'debug-client', version: '1.0.0' },
        { capabilities: {} }
    );
    try {
        await client.connect(transport);
        // List Tools
        const toolsResult = await client.listTools();
        const tools = toolsResult.tools;
        let widgetTool = null;
        for (const tool of tools) {
            if (tool._meta) {
                if (tool._meta['ui/template'] && tool._meta['ui/template'].startsWith('ui://')) {
                    widgetTool = tool;
                }
            }
        }
        if (widgetTool) {
            const templateUri = widgetTool._meta['ui/template'];
            // Read Resource
            try {
                const resourceResult = await client.readResource({ uri: templateUri });
            } catch (err) {
                console.error('❌ Failed to read resource:', err.message);
            }
        }
    } catch (error) {
        console.error('❌ Error:', error);
        if (error.message.includes('ECONNREFUSED')) {
            console.error('Make sure the MCP server is running on port 3000!');
        }
    } finally {
        await client.close();
        await transport.close();
    }
}
main();