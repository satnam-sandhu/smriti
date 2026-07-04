import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  getGatewayConfigurationDiagnostics,
  getNitrochatGatewayEndpoint,
  getRequiredRuntimeEnvDiagnostics,
  isNitrochatGatewayConfigured,
  isRuntimeEnvDiagnosticsEnabled,
} from '@/lib/gateway-env';

/**
 * API route to get runtime configuration
 * 
 * EFFICIENT APPROACH: Read from Kubernetes ConfigMap mounted as a file
 * This allows:
 * 1. Runtime configuration updates without redeployment
 * 2. No build-time embedding issues
 * 3. ConfigMap can be updated and pods will pick up changes (with restart or file watcher)
 * 
 * The config file is mounted at /app/config/runtime-config.json by Knative
 */

// Disable caching for this route to ensure fresh config is always returned
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_CHAT_CONTEXT_MAX_TOKENS = 50000;
const DEFAULT_CHAT_MAX_REQUEST_MESSAGES = 20;

/**
 * Image/file upload in the composer. Must come from server `process.env` so Knative env
 * updates apply — client bundles bake `NEXT_PUBLIC_*` at build time and ignore runtime env.
 * NitroCloud sets `ENABLE_FILE_SHARE` (no NEXT_PUBLIC prefix) so the Route Handler reads
 * the live pod value; `NEXT_PUBLIC_*` may still reflect the CI/build image defaults here.
 */
function resolveEnableImageUploadFromEnv(
  fileChat?: Record<string, unknown> | null,
): boolean {
  const runtime =
    process.env.ENABLE_FILE_SHARE ?? process.env.NITROCHAT_ENABLE_FILE_SHARE;
  if (runtime === 'true') return true;
  if (runtime === 'false') return false;

  const fs = process.env.NEXT_PUBLIC_ENABLE_FILE_SHARE;
  if (fs === 'true') return true;
  if (fs === 'false') return false;
  const legacy = process.env.NEXT_PUBLIC_CHAT_ENABLE_IMAGE_UPLOAD;
  if (legacy === 'true') return true;
  if (legacy === 'false') return false;
  const fromFile = fileChat?.enableImageUpload;
  if (typeof fromFile === 'boolean') return fromFile;
  return false;
}

/** Env overrides runtime JSON `chat.contextMaxTokens`; invalid values fall back to default. */
function resolveChatContextMaxTokens(fileChat?: Record<string, unknown> | null): number {
  const envRaw =
    process.env.CHAT_CONTEXT_MAX_TOKENS || process.env.NEXT_PUBLIC_CHAT_CONTEXT_MAX_TOKENS;
  if (envRaw) {
    const n = parseInt(String(envRaw), 10);
    if (Number.isFinite(n)) return n;
  }
  const fromFile = fileChat?.contextMaxTokens;
  if (fromFile != null && fromFile !== '') {
    const n = typeof fromFile === 'number' ? fromFile : parseInt(String(fromFile), 10);
    if (Number.isFinite(n)) return n;
  }
  return DEFAULT_CHAT_CONTEXT_MAX_TOKENS;
}

/** Env overrides runtime JSON `chat.maxRequestMessages`; invalid or missing falls back to default. */
function resolveChatMaxRequestMessages(fileChat?: Record<string, unknown> | null): number {
  const envRaw =
    process.env.CHAT_MAX_REQUEST_MESSAGES || process.env.NEXT_PUBLIC_CHAT_MAX_REQUEST_MESSAGES;
  if (envRaw) {
    const n = parseInt(String(envRaw), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const fromFile = fileChat?.maxRequestMessages;
  if (fromFile != null && fromFile !== '') {
    const n = typeof fromFile === 'number' ? fromFile : parseInt(String(fromFile), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_CHAT_MAX_REQUEST_MESSAGES;
}

function getSafeRuntimeEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const sensitivePatterns = [
    /key/i,
    /secret/i,
    /password/i,
    /uri/i,
    /token/i,
  ];

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
    if (isSensitive) continue;

    if (key.startsWith('NEXT_PUBLIC_')) {
      env[key] = value;
      continue;
    }

    if (key.startsWith('NITROCHAT_')) {
      env[key] = value;
      continue;
    }

    const safeWhitelist = [
      'APP_NAME',
      'APP_TAGLINE',
      'APP_LOGO',
      'APP_FAVICON',
      'ENABLE_FILE_SHARE',
      'FOCUS_MODE',
      'THREADS_ENABLED',
      'ZITADEL_ENABLED',
      'ZITADEL_ISSUER',
      'ZITADEL_CLIENT_ID',
      'ZITADEL_LOGIN_LABEL',
      'OAUTH_CLIENT_ID',
      'OAUTH_AUTHORIZATION_ENDPOINT',
      'OAUTH_TOKEN_ENDPOINT',
      'OAUTH_AUDIENCE',
      'NEXT_PUBLIC_DEBUG_TOOL_CHAIN'
    ];

    if (safeWhitelist.includes(key)) {
      env[key] = value;
    }
  }

  const threadsVal = process.env['NEXT_PUBLIC_THREADS_ENABLED'] || process.env['THREADS_ENABLED'];
  if (threadsVal) {
    env['NEXT_PUBLIC_THREADS_ENABLED'] = threadsVal;
  }

  return env;
}

export async function GET() {
  try {
    // Try to read from ConfigMap file first (most efficient, runtime-only)
    const configPath = process.env.RUNTIME_CONFIG_PATH || join(process.cwd(), 'config', 'runtime-config.json');


    let config: any = null;

    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      } catch (fileError: any) {
        console.error('[Config API] Error reading ConfigMap file:', fileError.message);
        console.error('[Config API] Error stack:', fileError.stack);
        // Fall through to env var fallback
      }
    } else {
    }

    // Fallback: Read from environment variables (non-prefixed for runtime)
    if (!config) {

      const mcpServerUrl = process.env.MCP_SERVER_URL || process.env.NEXT_PUBLIC_MCP_SERVER_URL;
      const mcpApiKey = process.env.MCP_API_KEY || process.env.NEXT_PUBLIC_MCP_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      const geminiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      const elevenLabsKey = process.env.ELEVENLABS_API_KEY || process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

      config = {
        mcp: {
          serverUrl: mcpServerUrl || 'http://localhost:3000',
          apiKey: mcpApiKey,
          oauth: process.env.OAUTH_CLIENT_ID ? {
            required: true,
            serverName: 'OAuth Provider',
            authorizationEndpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT,
            tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT,
          } : undefined,
        },
        elevenLabs: {
          apiKey: elevenLabsKey || null,
        },
        branding: {
          name: process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || 'NitroChat',
          tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || process.env.APP_TAGLINE || 'AI-Powered Intelligent Assistant',
          logo: process.env.NEXT_PUBLIC_APP_LOGO || process.env.APP_LOGO,
          favicon: process.env.NEXT_PUBLIC_APP_FAVICON || process.env.APP_FAVICON,
        },
        ai: {
          openai: {
            enabled: !!openaiKey,
          },
          gemini: {
            enabled: !!geminiKey,
          },
        },
        theme_version_2: {
          mode:
            process.env.NEXT_PUBLIC_THEME_V2_MODE ||
            process.env.THEME_V2_MODE ||
            'system_default',
          brand_color:
            process.env.NEXT_PUBLIC_THEME_V2_BRAND_COLOR ||
            process.env.THEME_V2_BRAND_COLOR ||
            '#ffe500',
          logo_url_light:
            process.env.NEXT_PUBLIC_THEME_V2_LOGO_URL_LIGHT ||
            process.env.THEME_V2_LOGO_URL_LIGHT ||
            '/logo_white.png',
          logo_url_dark:
            process.env.NEXT_PUBLIC_THEME_V2_LOGO_URL_DARK ||
            process.env.THEME_V2_LOGO_URL_DARK ||
            '/logo_white.png',
          light: {
            brand_color:
              process.env.NEXT_PUBLIC_THEME_V2_BRAND_COLOR ||
              process.env.THEME_V2_BRAND_COLOR ||
              '#ffe500',
            advanced_customization: {},
          },
          dark: {
            brand_color:
              process.env.NEXT_PUBLIC_THEME_V2_BRAND_COLOR ||
              process.env.THEME_V2_BRAND_COLOR ||
              '#ffe500',
            advanced_customization: {},
          },
          advanced_customization: {},
        },
      };
    }

    // Always merge OAuth config from environment variables if present
    // This ensures OAuth works even if runtime-config.json doesn't have it
    if (process.env.OAUTH_CLIENT_ID) {
      if (!config.mcp) config.mcp = {};

      const mcpUrl = config.mcp.serverUrl || process.env.MCP_SERVER_URL || process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3000';
      const cleanMcpUrl = mcpUrl.replace(/\/$/, ''); // Remove trailing slash if present

      // Only set if not already present in config or force override from env
      // Here we treat env vars as the source of truth for secrets
      config.mcp.oauth = {
        required: true,
        serverName: 'OAuth Provider',
        authorizationEndpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT || '',
        tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT || '',
        audience: process.env.OAUTH_AUDIENCE || '',
        clientId: process.env.OAUTH_CLIENT_ID, // Add client ID
        scopes: ['openid', 'profile', 'email'],
        loginUrl: `${cleanMcpUrl}/oauth/login`,
        callbackUrl: `${cleanMcpUrl}/oauth/callback`,
        logoutUrl: `${cleanMcpUrl}/oauth/logout`,
      };

      // Ensure critical endpoints come from env if set
      if (process.env.OAUTH_AUTHORIZATION_ENDPOINT) {
        config.mcp.oauth.authorizationEndpoint = process.env.OAUTH_AUTHORIZATION_ENDPOINT;
      }
      if (process.env.OAUTH_TOKEN_ENDPOINT) {
        config.mcp.oauth.tokenEndpoint = process.env.OAUTH_TOKEN_ENDPOINT;
      }

    }

    /**
     * Optional Zitadel login, parallel to the existing OAuth path above.
     * Never mutates `config.mcp.oauth`; clients must treat the two
     * providers as independent. The block is emitted when
     * `ZITADEL_ENABLED` is exactly "true" and issuer + client id are set.
     * `ZITADEL_CLIENT_SECRET` stays server-only for `/api/auth/zitadel/token`
     * and `/refresh` — omitting it does not hide the login UI, but those
     * routes return 503 until the secret is configured.
     */
    if (
      process.env.ZITADEL_ENABLED === 'true' &&
      process.env.ZITADEL_ISSUER &&
      process.env.ZITADEL_CLIENT_ID
    ) {
      if (!config.mcp) config.mcp = {};
      const issuer = process.env.ZITADEL_ISSUER.replace(/\/+$/, '');
      const zitadelOrg =
        process.env.ZITADEL_ORGANIZATION_ID?.trim() ||
        process.env.ZITADEL_ORG_ID?.trim();
      const zitadelScopes: string[] = [
        'openid',
        'profile',
        'email',
        'offline_access',
      ];
      if (zitadelOrg) {
        zitadelScopes.push(`urn:zitadel:iam:org:id:${zitadelOrg}`);
      }
      const zitadelProjectId = process.env.ZITADEL_PROJECT_ID?.trim();
      if (zitadelProjectId) {
        zitadelScopes.push(
          `urn:zitadel:iam:org:project:id:${zitadelProjectId}:aud`,
          'urn:zitadel:iam:org:projects:roles',
        );
      }
      config.mcp.zitadel = {
        enabled: true,
        issuer,
        authorizationEndpoint: `${issuer}/oauth/v2/authorize`,
        tokenEndpoint: `${issuer}/oauth/v2/token`,
        userinfoEndpoint: `${issuer}/oidc/v1/userinfo`,
        clientId: process.env.ZITADEL_CLIENT_ID,
        audience:
          process.env.ZITADEL_AUDIENCE ||
          zitadelProjectId ||
          process.env.ZITADEL_CLIENT_ID,
        scopes: zitadelScopes,
        loginLabel: process.env.ZITADEL_LOGIN_LABEL || 'Sign in with Zitadel',
        idpHint: process.env.ZITADEL_IDP_HINT?.trim() || undefined,
      };
    }

    // Always merge ElevenLabs from env if present (even if config file exists)
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY || process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    if (elevenLabsKey) {
      if (!config.elevenLabs) config.elevenLabs = {};
      config.elevenLabs.apiKey = elevenLabsKey;
    } else {
    }

    // Add persistence config
    config.persistence = {
      enabled: !!process.env.MONGODB_URI && !!process.env.MONGODB_DB_NAME,
    };

    // Chat context limit (max tokens per chat window; prompt user to start new chat when exceeded)
    if (!config.chat) config.chat = {} as any;
    (config.chat as any).contextMaxTokens = resolveChatContextMaxTokens(
      config.chat as Record<string, unknown>,
    );
    (config.chat as any).maxRequestMessages = resolveChatMaxRequestMessages(
      config.chat as Record<string, unknown>,
    );
    (config.chat as any).enableImageUpload = resolveEnableImageUploadFromEnv(
      config.chat as Record<string, unknown>,
    );

    // Add gateway config (NitroChat gateway integration)
    const gatewayEndpoint = getNitrochatGatewayEndpoint();
    const modelSelectionEnabled = process.env.NITROCHAT_MODEL_SELECTION === 'true';
    const nitroChatFixedModel = (process.env.NITROCHAT_MODEL || '').trim();
    const gatewayDiag = getGatewayConfigurationDiagnostics();
    const existingGateway =
      config.gateway && typeof config.gateway === 'object' ? config.gateway : {};

    config.gateway = {
      ...existingGateway,
      enabled: isNitrochatGatewayConfigured(),
      modelSelectionEnabled,
      /** Public gateway base URL from pod env `NITROCHAT_GATEWAY_ENDPOINT` (injected by NitroCloud); not a secret. */
      endpoint: gatewayEndpoint || undefined,
      endpointConfigured: gatewayDiag.endpointConfigured,
      apiKeyConfigured: gatewayDiag.apiKeyConfigured,
    };

    /** Sent to clients when NITROCHAT_MODEL_SELECTION is false — requests should use this model id. */
    config.nitroChatFixedModel = nitroChatFixedModel;

    // Chat is gateway-only: never advertise direct OpenAI/Gemini keys as "chat enabled".
    if (!config.ai) config.ai = { openai: { enabled: false }, gemini: { enabled: false } };
    if (config.gateway.enabled) {
      config.ai = {
        ...config.ai,
        openai: { enabled: true },
        gemini: { enabled: true },
      };
    } else {
      config.ai = {
        ...config.ai,
        openai: { enabled: false },
        gemini: { enabled: false },
      };
    }

    // Focus mode: only answer within MCP/tools context (env or runtime-config)
    const focusModeEnv = process.env.FOCUS_MODE === 'true' || process.env.NEXT_PUBLIC_FOCUS_MODE === 'true';
    config.focusMode = focusModeEnv || config.focusMode === true;

    // System prompt from runtime config (optional; can be empty string)
    if (config.systemPrompt === undefined && process.env.SYSTEM_PROMPT != null) {
      config.systemPrompt = process.env.SYSTEM_PROMPT;
    }

    // Terms of Service and Privacy Policy URLs (runtime config or env)
    if (config.termsOfServiceUrl === undefined && process.env.TERMS_OF_SERVICE_URL) {
      config.termsOfServiceUrl = process.env.TERMS_OF_SERVICE_URL;
    }
    if (config.privacyPolicyUrl === undefined && process.env.PRIVACY_POLICY_URL) {
      config.privacyPolicyUrl = process.env.PRIVACY_POLICY_URL;
    }

    const { diagnostics: _ignoredDiagnostics, ...safeConfig } = config;

    const mergedConfig = {
      ...safeConfig,
      ...(isRuntimeEnvDiagnosticsEnabled()
        ? { diagnostics: getRequiredRuntimeEnvDiagnostics() }
        : {}),
      env: getSafeRuntimeEnv(),
    };

    if (!mergedConfig.features) {
      mergedConfig.features = {};
    }
    mergedConfig.features.threadsEnabled =
      process.env['NEXT_PUBLIC_THREADS_ENABLED'] === 'true' ||
      process.env['THREADS_ENABLED'] === 'true';

    // Return config with CORS headers to allow embedding from different origins
    return NextResponse.json(mergedConfig, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('[Config API] Error reading configuration:', error.message);
    // Return default config as fallback
    const gatewayEndpointFb = getNitrochatGatewayEndpoint();
    const gatewayDiagFb = getGatewayConfigurationDiagnostics();
    return NextResponse.json({
      mcp: {
        serverUrl: 'http://localhost:3000',
        apiKey: undefined,
      },
      branding: {
        name: 'NitroChat',
        tagline: 'AI-Powered Intelligent Assistant',
      },
      ai: {
        openai: { enabled: false },
        gemini: { enabled: false },
      },
      persistence: { enabled: false },
      chat: {
        contextMaxTokens: resolveChatContextMaxTokens(null),
        maxRequestMessages: resolveChatMaxRequestMessages(null),
        enableImageUpload: resolveEnableImageUploadFromEnv(null),
      },
      gateway: {
        enabled: isNitrochatGatewayConfigured(),
        modelSelectionEnabled: process.env.NITROCHAT_MODEL_SELECTION === 'true',
        endpoint: gatewayEndpointFb || undefined,
        endpointConfigured: gatewayDiagFb.endpointConfigured,
        apiKeyConfigured: gatewayDiagFb.apiKeyConfigured,
      },
      nitroChatFixedModel: (process.env.NITROCHAT_MODEL || '').trim(),
      ...(isRuntimeEnvDiagnosticsEnabled()
        ? { diagnostics: getRequiredRuntimeEnvDiagnostics() }
        : {}),
      features: {
        threadsEnabled:
          process.env['NEXT_PUBLIC_THREADS_ENABLED'] === 'true' ||
          process.env['THREADS_ENABLED'] === 'true',
      },
      env: getSafeRuntimeEnv(),
    });
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
