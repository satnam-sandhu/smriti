'use client';

import { useEffect, useState, useRef } from 'react';
import { getMcpClient } from '@/lib/mcp-client';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface McpWidgetProps {
    toolName: string;
    toolResult: any;
    templateUri: string;
    currentTheme?: 'dark' | 'light'; // Current theme from parent
}

function formatWidgetHeight(height: unknown): string {
    if (typeof height === 'number') {
        const safeHeight = Math.max(100, Math.min(height, 1200));
        return `${safeHeight}px`;
    }

    if (typeof height === 'string') {
        const trimmed = height.trim();
        // Check if string contains only digits/decimals (e.g. "200" or "150.5")
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const parsed = parseFloat(trimmed);
            const safeHeight = Math.max(100, Math.min(parsed, 1200));
            return `${safeHeight}px`;
        }
        // Return string units (e.g. "50vh", "30rem", "100%") directly
        return trimmed;
    }

    // Default fallback value
    return 'clamp(440px, 72vh, 860px)';
}

export function McpWidget({ toolName, toolResult, templateUri, currentTheme }: McpWidgetProps) {
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>(currentTheme || 'dark');
    const [themeLoaded, setThemeLoaded] = useState(false);
    const [iframeHeight, setIframeHeight] = useState<string>('clamp(440px, 72vh, 860px)');
    const [widgetId] = useState(() => `widget-${Math.random().toString(36).substr(2, 9)}`);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Handle dynamic height updates from within the iframe widget
    useEffect(() => {
        const handleResizeMessage = (event: MessageEvent) => {
            if (event.data?.type === 'nitro:set_height' && event.data?.widgetId === widgetId && event.data?.height !== undefined) {
                setIframeHeight(formatWidgetHeight(event.data.height));
            }
        };

        window.addEventListener('message', handleResizeMessage);
        return () => window.removeEventListener('message', handleResizeMessage);
    }, [widgetId]);

    // Update theme when currentTheme prop changes
    useEffect(() => {
        if (currentTheme) {
            setThemeMode(currentTheme);
            setThemeLoaded(true);
        }
    }, [currentTheme]);

    // Fetch theme mode from config only if not provided as prop
    useEffect(() => {
        if (currentTheme) return; // Skip if theme is provided as prop

        fetch('/api/config')
            .then(res => res.json())
            .then(data => {
                const mode = data.theme_version_2?.mode;
                if (mode === 'dark' || mode === 'light') {
                    setThemeMode(mode);
                } else if (mode === 'system_default' && typeof window !== 'undefined' && window.matchMedia) {
                    setThemeMode(
                        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                    );
                }
                setThemeLoaded(true);
            })
            .catch(err => {
                console.error('Failed to fetch theme config:', err);
                setThemeLoaded(true);
            });
    }, [currentTheme]);

    useEffect(() => {
        const loadTemplate = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch the template content
                let content = '';

                // Check if it's a URL (http/https)
                const isUrl = /^(http|https):\/\//.test(templateUri);

                if (isUrl) {
                    const response = await fetch(templateUri);
                    if (!response.ok) throw new Error('Failed to fetch template URL');
                    content = await response.text();
                } else {
                    // Treat as MCP resource (ui:// or schema-less)
                    const mcpClient = getMcpClient();
                    const response = await mcpClient.readResource(templateUri);

                    if (response.success && response.data) {
                        // Handle different resource response formats
                        const resourceData = response.data as any;
                        if (resourceData.contents && resourceData.contents.length > 0) {
                            content = resourceData.contents[0].text;
                        } else if (Array.isArray(resourceData) && resourceData.length > 0) {
                            content = resourceData[0].text;
                        } else {
                            throw new Error('Empty resource content');
                        }
                    } else {
                        throw new Error(response.error || 'Failed to load widget template');
                    }
                }

                setHtmlContent(content);
            } catch (err: any) {
                console.error('Failed to load widget template:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadTemplate();
    }, [templateUri]);

    // Inject window.openai shim when HTML content and theme are ready
    useEffect(() => {
        if (!htmlContent || !iframeRef.current || !themeLoaded) return;

        const iframe = iframeRef.current;
        const doc = iframe.contentDocument;

        if (!doc) return;

        // Prepare the shim script
        // We need to parse the tool result to get structuredContent and _meta
        // The toolResult might be a string (JSON) or an object
        let parsedResult = toolResult;
        if (typeof toolResult === 'string') {
            try {
                parsedResult = JSON.parse(toolResult);
            } catch (e) {
            }
        }

        // Extract payloads according to MCP spec
        // Note: The tool result structure from our backend might differ slightly
        // We expect { structuredContent: ..., _meta: ..., content: ... }
        // But if it's just the raw result, we might need to adapt.

        // Prefer the 'data' field if the tool wraps output there (e.g., { success, data, metadata })
        const structuredContent = parsedResult?.data ?? parsedResult?.structuredContent ?? parsedResult;
        const meta = parsedResult._meta || {};

        const isDark = themeMode === 'dark';
        const shimScript = `
      // Apply theme to widget based on NitroChat theme mode
      ${isDark ? "document.documentElement.classList.add('dark');" : "document.documentElement.classList.remove('dark');"}
      
      window.openai = {
        widgetId: '${widgetId}',
        toolOutput: ${JSON.stringify(structuredContent)},
        toolResponseMetadata: ${JSON.stringify(meta)},
        widgetState: {},
        theme: '${themeMode}',
        setWidgetState: (state) => {
          window.openai.widgetState = state;
        },
        callTool: async (name, args) => {
          window.parent.postMessage({
            type: 'nitro:call_tool',
            toolName: name,
            arguments: args
          }, '*');
          return new Promise((resolve) => {
            const handleResponse = (event) => {
              if (event.data.type === 'nitro:tool_result' && event.data.toolName === name) {
                window.removeEventListener('message', handleResponse);
                resolve(event.data.result);
              }
            };
            window.addEventListener('message', handleResponse);
          });
        }
      };
    `;

        // Inject the shim script before the widget HTML
        // We need to find the </head> tag and insert our script before it
        let modifiedHtml = htmlContent;
        const headCloseIndex = modifiedHtml.indexOf('</head>');
        if (headCloseIndex !== -1) {
            modifiedHtml =
                modifiedHtml.slice(0, headCloseIndex) +
                `<script>${shimScript}</script>` +
                modifiedHtml.slice(headCloseIndex);
        } else {
            // If no </head>, try to inject before </body> or at the start
            const bodyCloseIndex = modifiedHtml.indexOf('</body>');
            if (bodyCloseIndex !== -1) {
                modifiedHtml =
                    modifiedHtml.slice(0, bodyCloseIndex) +
                    `<script>${shimScript}</script>` +
                    modifiedHtml.slice(bodyCloseIndex);
            } else {
                // Last resort: prepend to the HTML
                modifiedHtml = `<script>${shimScript}</script>` + modifiedHtml;
            }
        }

        // Create a blob URL for the HTML content
        // This allows the widget to load relative resources properly
        const blob = new Blob([modifiedHtml], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);

        // Set the iframe src to the blob URL
        if (iframeRef.current) {
            iframeRef.current.src = blobUrl;

            // Clean up the blob URL when component unmounts
            return () => {
                URL.revokeObjectURL(blobUrl);
            };
        }

    }, [htmlContent, toolResult, themeLoaded, themeMode]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48 bg-card/30 rounded-lg border border-border">
                <RefreshCw className="w-6 h-6 text-muted opacity-50" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-error/10 rounded-lg border border-error/30 p-4 text-center">
                <AlertCircle className="w-8 h-8 text-error mb-2" />
                <p className="text-sm text-error font-medium">Failed to load widget</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
        );
    }

    return (
        <div className="w-full my-2">
            <iframe
                ref={iframeRef}
                className="w-full border-none bg-transparent rounded-lg"
                style={{
                    height: iframeHeight,
                    minHeight: iframeHeight === 'clamp(440px, 72vh, 860px)' ? '440px' : 'auto',
                }}
                sandbox="allow-scripts allow-same-origin allow-forms"
                title={`Widget for ${toolName}`}
            />
        </div>
    );
}
