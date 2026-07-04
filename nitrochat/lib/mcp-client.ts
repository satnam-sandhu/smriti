/**
 * Standard MCP Client for NitroChat
 * 
 * Uses the official @modelcontextprotocol/sdk SSEClientTransport
 * This is the standard way to connect to MCP servers over HTTP/SSE
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';

export interface McpClientConfig {
  serverUrl: string;
  basePath?: string;
  headers?: Record<string, string>;
}

export interface McpResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * MCP Client wrapper with standard SSE protocol support
 */
export class McpClient {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;
  private isConnected = false;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;
  private authorizationHeader: string | null = null; // Store auth header for metadata

  /**
   * Connect to MCP server using official SSE transport
   */
  async connect(config: McpClientConfig): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = (async () => {
      try {

        const basePath = config.basePath || '/mcp';

        // Ensure URL is properly formatted and uses HTTPS for production
        let serverUrl = config.serverUrl.trim();
        // Normalize URL: ensure it has a protocol
        if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
          serverUrl = `https://${serverUrl}`;
        }
        // For production (non-localhost), ensure HTTPS
        if (serverUrl.startsWith('http://') && !serverUrl.includes('localhost') && !serverUrl.includes('127.0.0.1')) {
          serverUrl = serverUrl.replace('http://', 'https://');
        }

        // Connect directly to the MCP server
        // The server-side fix ensures the endpoint URL matches the connection origin
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const sseEndpoint = `${serverUrl}${basePath}/sse?clientId=${clientId}`;


        // Create URL object for the SSE endpoint
        const sseUrl = new URL(sseEndpoint);

        // Patch EventSource globally to intercept endpoint events and fix URL mismatch
        // Server sends /mcp but SSEClientTransport expects /mcp/message when connecting to /mcp/sse
        const EventSourceClass = typeof window !== 'undefined' ? window.EventSource : EventSource;
        const OriginalEventSource = EventSourceClass;

        // Create a patched EventSource constructor
        const PatchedEventSource = function (this: any, url: string | URL, eventSourceInitDict?: any) {
          const instance = new OriginalEventSource(url, eventSourceInitDict);

          // Patch addEventListener to intercept endpoint events and filter unsolicited responses
          const originalAddEventListener = instance.addEventListener.bind(instance);
          instance.addEventListener = function (type: string, listener: any, options?: any) {
            if (type === 'endpoint' && listener) {
              const wrappedListener = (event: Event) => {
                if (!(event instanceof MessageEvent)) {
                  if (typeof listener === 'function') {
                    listener(event);
                  } else if (listener && typeof listener.handleEvent === 'function') {
                    listener.handleEvent(event);
                  }
                  return;
                }
                try {
                  const endpointUrl = new URL(event.data, url.toString());
                  // If endpoint is /mcp and we connected to /mcp/sse, rewrite to /mcp/message
                  if (endpointUrl.pathname === '/mcp' && sseUrl.pathname.endsWith('/sse')) {
                    endpointUrl.pathname = '/mcp/message';
                    // Create a new event with the rewritten URL
                    const rewrittenEvent = new MessageEvent('endpoint', {
                      data: endpointUrl.toString(),
                      origin: event.origin,
                      lastEventId: event.lastEventId,
                    });
                    if (typeof listener === 'function') {
                      listener(rewrittenEvent);
                    } else if (listener && typeof listener.handleEvent === 'function') {
                      listener.handleEvent(rewrittenEvent);
                    }
                    return;
                  }
                } catch (e) {
                  console.error('Failed to rewrite MCP endpoint URL:', e);
                }
                // Pass through original event if rewriting failed or not needed
                if (typeof listener === 'function') {
                  listener(event);
                } else if (listener && typeof listener.handleEvent === 'function') {
                  listener.handleEvent(event);
                }
              };
              return originalAddEventListener(type, wrappedListener, options);
            } else if (type === 'message' && listener) {
              // Intercept message events to filter out unsolicited responses with id:0
              const wrappedListener = (event: Event) => {
                if (event instanceof MessageEvent) {
                  try {
                    const data = JSON.parse(event.data);
                    // Filter out unsolicited initialize responses with id:0
                    // These are sent by the server before the client's initialize request
                    if (data.jsonrpc === '2.0' && data.id === 0 && data.result && data.result.protocolVersion) {
                      return; // Don't pass through unsolicited responses
                    }
                  } catch (e) {
                    // Not JSON, pass through
                  }
                }
                // Pass through all other messages
                if (typeof listener === 'function') {
                  listener(event);
                } else if (listener && typeof listener.handleEvent === 'function') {
                  listener.handleEvent(event);
                }
              };
              return originalAddEventListener(type, wrappedListener, options);
            }
            return originalAddEventListener(type, listener, options);
          };

          return instance;
        } as any;

        // Copy EventSource prototype
        PatchedEventSource.prototype = OriginalEventSource.prototype;
        PatchedEventSource.CONNECTING = OriginalEventSource.CONNECTING;
        PatchedEventSource.OPEN = OriginalEventSource.OPEN;
        PatchedEventSource.CLOSED = OriginalEventSource.CLOSED;

        // Temporarily replace EventSource with patched version
        if (typeof window !== 'undefined') {
          (window as any).EventSource = PatchedEventSource;
        }
        const globalEventSource = (global as any).EventSource;
        if (globalEventSource) {
          (global as any).EventSource = PatchedEventSource;
        }

        // Create SSE transport using SDK's official implementation
        this.transport = new SSEClientTransport(
          sseUrl,
          {
            requestInit: {
              headers: {
                ...config.headers,
              },
            },
            eventSourceInit: {
              fetch: typeof window !== 'undefined' && window.EventSource
                ? undefined
                : async (input: Request | URL | string, init?: RequestInit) => {
                  const headers = new Headers({ ...(init?.headers || {}), ...(config.headers || {}) });
                  return fetch(input, { ...init, headers });
                },
            } as any,
          },
        );

        // Store authorization header for metadata
        this.authorizationHeader = config.headers?.['Authorization'] || null;

        // Restore original EventSource after transport is created
        if (typeof window !== 'undefined') {
          (window as any).EventSource = OriginalEventSource;
        }
        if (globalEventSource) {
          (global as any).EventSource = OriginalEventSource;
        }

        // Create client
        this.client = new Client(
          {
            name: 'nitrochat-client',
            version: '1.0.0',
          },
          {
            capabilities: {},
          },
        );

        // Set up event handlers
        let initializationComplete = false;
        let pendingInitialization = false;

        this.client.onerror = (error: any) => {
          // Filter out non-fatal errors that can occur during initialization
          const errorMessage = error?.message || String(error);
          const errorString = String(error);

          // During initialization, "unknown message ID" errors can occur if server sends
          // unsolicited responses. We'll handle this in the connect() method.
          if (errorMessage.includes('unknown message ID') ||
            errorMessage.includes('Received a response for an unknown message ID') ||
            errorString.includes('unknown message ID')) {
            if (!initializationComplete && pendingInitialization) {
              // This is happening during initialization - will be handled by retry logic
              return;
            }
            return; // Don't treat as fatal error after initialization
          }

          // Ignore undefined SSE errors that occur during reconnection attempts
          if (errorMessage.includes('SSE error: undefined') ||
            errorString.includes('SSE error: undefined')) {
            return; // Don't treat as fatal error
          }

          console.error('❌ MCP Client error:', error);
        };

        this.client.onclose = () => {
          this.isConnected = false;
        };

        // Connect client to transport
        // The SDK handles all SSE connection logic automatically

        pendingInitialization = true;

        // Wrap connect in a timeout to catch hanging connections
        const connectPromise = this.client.connect(this.transport);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout after 15 seconds')), 15000);
        });

        try {
          await Promise.race([connectPromise, timeoutPromise]);
          initializationComplete = true;
          pendingInitialization = false;

          // Verify client is still available (might have been set to null in error handler)
          if (!this.client) {
            throw new Error('Connection failed - client is null after connect promise resolved');
          }

          // Verify connection by checking if client has server capabilities
          const serverCapabilities = this.client.getServerCapabilities();
          const serverVersion = this.client.getServerVersion();

          if (!serverCapabilities) {
            console.error('❌ Handshake completed but no capabilities received.', { serverVersion });
            throw new Error('Connection established but server capabilities not received - initialization may have failed');
          }

          this.isConnected = true;
        } catch (error: any) {
          const errorMessage = error?.message || String(error);
          // Check if it's the "unknown message ID" error that's blocking initialization
          if (errorMessage.includes('unknown message ID') || errorMessage.includes('Received a response for an unknown message ID')) {
            // Close and retry once
            try {
              if (this.transport) {
                await this.transport.close();
              }
              // Recreate transport and client
              this.transport = new SSEClientTransport(
                sseUrl,
                {
                  requestInit: {
                    headers: {
                      ...config.headers,
                    },
                  },
                  eventSourceInit: {
                    fetch: typeof window !== 'undefined' && window.EventSource
                      ? undefined
                      : async (input: Request | URL | string, init?: RequestInit) => {
                        const headers = new Headers({ ...(init?.headers || {}), ...(config.headers || {}) });
                        return fetch(input, { ...init, headers });
                      },
                  } as any,
                },
              );
              this.client = new Client(
                {
                  name: 'nitrochat-client',
                  version: '1.0.0',
                },
                {
                  capabilities: {},
                },
              );
              this.client.onerror = (error: any) => {
                const errorMessage = error?.message || String(error);
                const errorString = String(error);
                if (errorMessage.includes('unknown message ID') ||
                  errorMessage.includes('Received a response for an unknown message ID') ||
                  errorString.includes('unknown message ID')) {
                  // During retry, these errors are expected - server may send unsolicited responses
                  return;
                }
                if (errorMessage.includes('SSE error: undefined') ||
                  errorString.includes('SSE error: undefined')) {
                  return;
                }
                console.error('❌ MCP Client error:', error);
              };
              this.client.onclose = () => {
                this.isConnected = false;
              };

              // Retry connection with a small delay to let server settle
              await new Promise(resolve => setTimeout(resolve, 1000));
              await this.client.connect(this.transport);

              // Verify client is still available
              if (!this.client) {
                throw new Error('Connection retry failed - client is null');
              }

              // Verify connection after retry
              const serverCapabilities = this.client.getServerCapabilities();
              if (!serverCapabilities) {
                throw new Error('Connection retry failed - server capabilities not received');
              }

              this.isConnected = true;
            } catch (retryError: any) {
              console.error('❌ Connection retry failed:', retryError);
              throw new Error(`Connection failed after retry: ${retryError?.message || retryError}`);
            }
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error('❌ Failed to connect MCP client:', error);
        this.client = null;
        this.transport = null;
        this.isConnected = false;
        throw error;
      } finally {
        this.isConnecting = false;
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Update authorization headers without reconnecting
   * Useful for updating OAuth tokens after authentication
   */
  updateHeaders(headers: Record<string, string>): void {
    if (headers['Authorization']) {
      this.authorizationHeader = headers['Authorization'];
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }


    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      this.client = null;
      this.transport = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Ping the MCP server
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      // Check if we have server capabilities (indicates successful initialization)
      const serverCapabilities = this.client.getServerCapabilities();
      if (!serverCapabilities) {
        return false;
      }

      await this.client.ping();
      return true;
    } catch (error: any) {
      console.error('Ping failed:', error);
      // If ping fails, mark as disconnected
      this.isConnected = false;
      return false;
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const result = await this.client.listTools();
      const tools = result.tools || [];
      return {
        success: true,
        data: {
          tools: tools,
        },
      };
    } catch (error: any) {
      console.error('❌ Failed to list tools:', error);
      console.error('❌ Error details:', error.message, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to list tools',
      };
    }
  }

  /**
   * Call a specific tool
   */
  async callTool(name: string, args: Record<string, any>): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Include authorization in args._meta to match Studio's approach
      const toolArgs = { ...args };

      if (this.authorizationHeader) {
        toolArgs._meta = {
          ...(toolArgs._meta || {}),
          authorization: this.authorizationHeader,
          _jwt: this.authorizationHeader.replace('Bearer ', ''),
        };
      }

      const result = await this.client.callTool({
        name,
        arguments: toolArgs,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Failed to call tool:', error);
      return {
        success: false,
        error: error.message || 'Failed to call tool',
      };
    }
  }

  /**
   * List all available prompts
   */
  async listPrompts(): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const result = await this.client.listPrompts();
      const prompts = result.prompts || [];
      return {
        success: true,
        data: {
          prompts: prompts,
        },
      };
    } catch (error: any) {
      console.error('❌ Failed to list prompts:', error);
      console.error('❌ Error details:', error.message, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to list prompts',
      };
    }
  }

  /**
   * Get a specific prompt
   */
  async getPrompt(name: string, args?: Record<string, any>): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const result = await this.client.getPrompt({
        name,
        arguments: args,
      });
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Failed to get prompt:', error);
      return {
        success: false,
        error: error.message || 'Failed to get prompt',
      };
    }
  }

  /**
   * List all available resources
   */
  async listResources(): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const result = await this.client.listResources();
      const resources = result.resources || [];
      return {
        success: true,
        data: {
          resources: resources,
        },
      };
    } catch (error: any) {
      console.error('❌ Failed to list resources:', error);
      console.error('❌ Error details:', error.message, error.stack);
      return {
        success: false,
        error: error.message || 'Failed to list resources',
      };
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(uri: string): Promise<McpResponse> {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const result = await this.client.readResource({
        uri,
      });
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error('Failed to read resource:', error);
      return {
        success: false,
        error: error.message || 'Failed to read resource',
      };
    }
  }

  /**
   * Get the underlying client instance
   */
  getClient(): Client | null {
    return this.client;
  }
}

// Singleton instance
let clientInstance: McpClient | null = null;

/**
 * Get or create the MCP client singleton
 */
export function getMcpClient(): McpClient {
  if (!clientInstance) {
    clientInstance = new McpClient();
  }
  return clientInstance;
}
