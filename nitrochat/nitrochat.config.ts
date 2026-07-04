/**
 * NitroChat Configuration
 * 
 * This file contains all customizable branding and behavior settings.
 * Modify these values to match your brand and requirements.
 */

import type { ThemeV2 } from '@/lib/theme-runtime';
import { withMergedRuntimeTheme } from '@/lib/theme-runtime';
export type { ThemeV2 } from '@/lib/theme-runtime';

export interface NitroChatConfig {
  // Branding
  branding: {
    name: string;
    tagline: string;
    logo?: string;
    favicon?: string; // Legacy support
    faviconDark?: string;
    faviconLight?: string;
    /** When set (e.g. from runtime-config.json), applied to standalone chat chrome; otherwise the app body font is used. */
    fontFamily?: string;
  };

  /**
   * Theme schema v2: `mode` and logos at root; `light` / `dark` hold `brand_color` + `advanced_customization`.
   * Optional legacy root `brand_color` / `advanced_customization` still merge as lowest-priority fallbacks.
   * See `lib/theme-runtime.ts` (`getResolvedThemeV2Palette`, `applyRuntimeThemeToRoot`).
   */
  theme_version_2: ThemeV2;

  // MCP Server Configuration
  mcp: {
    serverUrl: string;
    apiKey?: string;
    timeout?: number;
    oauth?: {
      required: boolean;
      serverName?: string;
      serverLogo?: string;
      authorizationEndpoint?: string;
      tokenEndpoint?: string;
      audience?: string;
    };
    /**
     * Optional Zitadel login configuration — parallel to the generic
     * `oauth` block above. Populated by `/api/config` only when
     * `ZITADEL_ENABLED === 'true'` on the server.
     */
    zitadel?: {
      enabled: boolean;
      issuer: string;
      authorizationEndpoint: string;
      tokenEndpoint: string;
      userinfoEndpoint?: string;
      clientId: string;
      audience?: string;
      scopes?: string[];
      loginLabel?: string;
      /** Zitadel IdP ID to hint on the authorize request, bypassing the Zitadel hosted login page. */
      idpHint?: string;
    };
  };

  // Chat Behavior
  chat: {
    welcomeMessage: string;
    placeholder: string;
    maxMessageLength: number;
    enableImageUpload: boolean;
    enableVoiceInput: boolean;
    suggestedPrompts: string[];
    /** Max context size in tokens for one chat; over this, user is prompted to start a new chat. From CHAT_CONTEXT_MAX_TOKENS. */
    contextMaxTokens?: number;
    /**
     * Sliding window: max chat messages sent to the model per request (the turn from the last user
     * message onward always ships in full). From CHAT_MAX_REQUEST_MESSAGES / NEXT_PUBLIC_CHAT_MAX_REQUEST_MESSAGES.
     */
    maxRequestMessages?: number;
    /** Shown when a session-end MCP tool completes (standalone / input replaced by banner). Overridable via runtime-config `chat`. */
    sessionCompletedDescription: string;
    /** When false, hide the session-complete banner (description + CTA). Default true. */
    sessionCompletedCtaEnabled?: boolean;
    /** When both are non-empty (e.g. from runtime-config `chat`), session-complete banner shows a CTA link. */
    sessionCompletedCtaLabel?: string;
    sessionCompletedCtaUrl?: string;
    /** Optional CTA button background (CSS color). Empty string uses theme `primary` in the chat UI. */
    sessionCompletedCtaBackground?: string;
    /** Optional CTA label color. Empty with default background uses `primary-foreground`. */
    sessionCompletedCtaColor?: string;
  };

  // AI Provider Settings
  ai: {
    defaultProvider: 'openai' | 'gemini';
    enableProviderSwitch: boolean;
    openai: {
      enabled: boolean;
    };
    gemini: {
      enabled: boolean;
    };
  };

  // Features
  features: {
    showPrompts: boolean;
    showResources: boolean;
    showTools: boolean;
    enableMarkdown: boolean;
    enableCodeHighlight: boolean;
    enableFileDownload: boolean;
    enableChatHistory: boolean;
    enableChatExport: boolean;
    threadsEnabled?: boolean;
  };

  // UI Preferences
  ui: {
    template: 'sidebar' | 'centered' | 'split-view' | 'compact';
    layout: 'centered' | 'fullwidth';
    maxWidth: string;
    borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
    fontSize: 'sm' | 'base' | 'lg';
    animationsEnabled: boolean;
    navbar?: {
      enabled: boolean;
      showPrompts: boolean;
      promptsLabel?: string;
    };
  };

  // Security
  security: {
    enableRateLimit: boolean;
    maxRequestsPerMinute: number;
    sanitizeInput: boolean;
    allowedOrigins: string[];
  };

  // Analytics (optional)
  analytics?: {
    enabled: boolean;
    trackingId?: string;
  };

  // Custom CSS (optional)
  customCss?: string;

  // Persistence
  persistence?: {
    enabled: boolean;
  };

  // ElevenLabs Voice/TTS Configuration
  elevenLabs?: {
    apiKey?: string | null;
  };

  // NitroChat Gateway Configuration (from GET /api/config; values reflect pod env from NitroCloud deploy)
  gateway?: {
    enabled: boolean;
    modelSelectionEnabled: boolean;
    /** `NITROCHAT_GATEWAY_ENDPOINT` — set on NitroCloud backend, injected into the NitroChat pod. */
    endpoint?: string;
    endpointConfigured?: boolean;
    apiKeyConfigured?: boolean;
  };

  /** Runtime diagnostics from `/api/config`; exposes presence only, never secret values. */
  diagnostics?: {
    requiredEnv?: Record<
      string,
      {
        required: boolean;
        configured: boolean;
        sensitive: boolean;
      }
    >;
    missingRequiredEnv?: string[];
  };

  // Model selection flag (backward compatibility)
  nitroChatModelSelection?: boolean;

  /** When model selection is off, OpenRouter model id from NITROCHAT_MODEL (via /api/config). */
  nitroChatFixedModel?: string;

  /** When true, assistant only answers within MCP/tools context and declines off-topic questions. Set via FOCUS_MODE or NEXT_PUBLIC_FOCUS_MODE. */
  focusMode?: boolean;

  /** Optional system prompt from runtime config; applied in chat when non-empty. Can be empty string. */
  systemPrompt?: string;

  /** Optional Terms of Service URL; shown in Settings user section when present. */
  termsOfServiceUrl?: string;

  /** Optional Privacy Policy URL; shown in Settings user section when present. */
  privacyPolicyUrl?: string;

  // Standalone Mode settings
  standaloneMode?: {
    headerText?: string;
    headerSubText?: string;
    headerSubTextColor?: string;
    /** Single logo URL (used when theme-specific logos are not set). */
    chatbotLogo?: string;
    /** Logo when the app surface is dark (`theme_version_2.mode` dark, or `system_default` + system dark). */
    chatbotLogoDark?: string;
    /** Logo when the app surface is light. */
    chatbotLogoLight?: string;
    welcomeText?: string;
    headerTextStyle?: {
      fontSize?: string;
      fontWeight?: string;
    };
    headerSubTextStyle?: {
      fontSize?: string;
      fontWeight?: string;
    };
  };
}

/**
 * Default Configuration
 * This is the base configuration that can be overridden
 */
export const defaultConfig: NitroChatConfig = {
  branding: {
    name: 'NitroChat',
    tagline: 'AI-Powered Intelligent Assistant',
    // logo: '/logo.svg',
    // favicon: '/favicon.ico',
  },

  theme_version_2: {
    mode: 'system_default',
    logo_url_light: '/logo_white.png',
    logo_url_dark: '/logo_white.png',
    light: {
      brand_color: '#ffe500',
      advanced_customization: {},
    },
    dark: {
      brand_color: '#ffe500',
      advanced_customization: {},
    },
  },

  mcp: {
    serverUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3000',
    apiKey: process.env.NEXT_PUBLIC_MCP_API_KEY,
    timeout: 30000,
  },

  chat: {
    welcomeMessage: 'Hello! How can I help you today?',
    placeholder: 'Type your message...',
    maxMessageLength: 4000,
    enableImageUpload: false, // Disabled by default, enable via ENABLE_FILE_SHARE
    enableVoiceInput: false,
    suggestedPrompts: [],
    contextMaxTokens: 50000, // Override via CHAT_CONTEXT_MAX_TOKENS or NEXT_PUBLIC_CHAT_CONTEXT_MAX_TOKENS
    maxRequestMessages: 20, // Override via CHAT_MAX_REQUEST_MESSAGES or NEXT_PUBLIC_CHAT_MAX_REQUEST_MESSAGES
    sessionCompletedDescription:
      'This session has ended successfully. Thank you for chatting with us — your request has been recorded. You can safely close this window, or refresh the page to start a new conversation.',
    sessionCompletedCtaEnabled: true,
  },

  ai: {
    defaultProvider: 'gemini',
    enableProviderSwitch: true,
    openai: {
      enabled: false,
    },
    gemini: {
      enabled: false,
    },
  },

  features: {
    showPrompts: true,
    showResources: true,
    showTools: true,
    enableMarkdown: true,
    enableCodeHighlight: true,
    enableFileDownload: true,
    enableChatHistory: true,
    enableChatExport: true,
    threadsEnabled: false,
  },

  ui: {
    template: 'sidebar',
    layout: 'centered',
    maxWidth: '1200px',
    borderRadius: 'md',
    fontSize: 'base',
    animationsEnabled: true,
    navbar: {
      enabled: true,
      showPrompts: true,
      promptsLabel: 'Available Prompts',
    },
  },

  security: {
    enableRateLimit: true,
    maxRequestsPerMinute: 60,
    sanitizeInput: true,
    allowedOrigins: ['*'],
  },

  analytics: {
    enabled: false,
  },

  persistence: {
    enabled: false,
  },

  focusMode: false,
  systemPrompt: undefined as string | undefined,
};

/**
 * Get Configuration
 * Merges custom config with defaults
 * Reads environment variables at runtime (for server-side) or from window (for client-side)
 */
export function getConfig(): NitroChatConfig {
  // Read environment variables at runtime
  // For client-side, these are embedded at build time, but we can also read from window.__ENV__ if needed
  const getEnv = (key: string, defaultVal?: string) => {
    if (typeof window !== 'undefined' && (window as any).__ENV__?.[key]) {
      return (window as any).__ENV__[key];
    }
    return process.env[key] || defaultVal;
  };

  const getBoolEnv = (key: string, defaultVal: boolean) => {
    const val = getEnv(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return defaultVal;
  };

  const getIntEnv = (key: string, defaultVal: number) => {
    const val = getEnv(key);
    return val ? parseInt(val, 10) : defaultVal;
  };

  const getArrayEnv = (key: string, defaultVal: string[]) => {
    const val = getEnv(key);
    return val ? val.split(',').map((s: string) => s.trim()) : defaultVal;
  };

  const config: NitroChatConfig = {
    ...defaultConfig,
    mcp: {
      ...defaultConfig.mcp,
      serverUrl: getEnv('NEXT_PUBLIC_MCP_SERVER_URL', defaultConfig.mcp.serverUrl),
      apiKey: getEnv('NEXT_PUBLIC_MCP_API_KEY', defaultConfig.mcp.apiKey),
    },
    branding: {
      ...defaultConfig.branding,
      name: getEnv('NEXT_PUBLIC_APP_NAME', defaultConfig.branding.name),
      tagline: getEnv('NEXT_PUBLIC_APP_TAGLINE', defaultConfig.branding.tagline),
      logo: getEnv('NEXT_PUBLIC_APP_LOGO', defaultConfig.branding.logo),
      favicon: getEnv('NEXT_PUBLIC_APP_FAVICON', defaultConfig.branding.favicon),
    },
    theme_version_2: withMergedRuntimeTheme(
      { theme_version_2: defaultConfig.theme_version_2 } as NitroChatConfig,
      {
        theme_version_2: {
          mode:
            (getEnv(
              'NEXT_PUBLIC_THEME_V2_MODE',
              defaultConfig.theme_version_2.mode,
            ) as 'dark' | 'light' | 'system_default') || 'system_default',
          /** Legacy one-line deploy: applies as fallback for both surfaces after merge. */
          brand_color: getEnv('NEXT_PUBLIC_THEME_V2_BRAND_COLOR', undefined),
          logo_url_light: getEnv(
            'NEXT_PUBLIC_THEME_V2_LOGO_URL_LIGHT',
            defaultConfig.theme_version_2.logo_url_light,
          ),
          logo_url_dark: getEnv(
            'NEXT_PUBLIC_THEME_V2_LOGO_URL_DARK',
            defaultConfig.theme_version_2.logo_url_dark,
          ),
        },
      },
    ).theme_version_2,
    chat: {
      ...defaultConfig.chat,
      welcomeMessage: getEnv('NEXT_PUBLIC_CHAT_WELCOME_MESSAGE', defaultConfig.chat.welcomeMessage),
      placeholder: getEnv('NEXT_PUBLIC_CHAT_PLACEHOLDER', defaultConfig.chat.placeholder),
      maxMessageLength: getIntEnv('NEXT_PUBLIC_CHAT_MAX_LENGTH', defaultConfig.chat.maxMessageLength),
      enableImageUpload: getBoolEnv('NEXT_PUBLIC_ENABLE_FILE_SHARE', defaultConfig.chat.enableImageUpload),
      enableVoiceInput: getBoolEnv('NEXT_PUBLIC_CHAT_ENABLE_VOICE_INPUT', defaultConfig.chat.enableVoiceInput),
      suggestedPrompts: getArrayEnv('NEXT_PUBLIC_CHAT_SUGGESTED_PROMPTS', defaultConfig.chat.suggestedPrompts),
      contextMaxTokens: (() => {
        if (typeof window === 'undefined') {
          const serverVal =
            process.env.CHAT_CONTEXT_MAX_TOKENS || process.env.NEXT_PUBLIC_CHAT_CONTEXT_MAX_TOKENS;
          if (serverVal) {
            const n = parseInt(serverVal, 10);
            if (Number.isFinite(n)) return n;
          }
          return defaultConfig.chat.contextMaxTokens ?? 50000;
        }
        return getIntEnv(
          'NEXT_PUBLIC_CHAT_CONTEXT_MAX_TOKENS',
          defaultConfig.chat.contextMaxTokens ?? 50000,
        );
      })(),
      maxRequestMessages: (() => {
        if (typeof window === 'undefined') {
          const serverVal =
            process.env.CHAT_MAX_REQUEST_MESSAGES ||
            process.env.NEXT_PUBLIC_CHAT_MAX_REQUEST_MESSAGES;
          if (serverVal) {
            const n = parseInt(serverVal, 10);
            if (Number.isFinite(n) && n > 0) return n;
          }
          return defaultConfig.chat.maxRequestMessages ?? 20;
        }
        return getIntEnv(
          'NEXT_PUBLIC_CHAT_MAX_REQUEST_MESSAGES',
          defaultConfig.chat.maxRequestMessages ?? 20,
        );
      })(),
    },
    ai: {
      ...defaultConfig.ai,
      defaultProvider: getEnv('NEXT_PUBLIC_AI_DEFAULT_PROVIDER', defaultConfig.ai.defaultProvider) as any,
      enableProviderSwitch: getBoolEnv('NEXT_PUBLIC_AI_ENABLE_PROVIDER_SWITCH', defaultConfig.ai.enableProviderSwitch),
      openai: {
        enabled: getBoolEnv('NEXT_PUBLIC_AI_OPENAI_ENABLED', false),
      },
      gemini: {
        enabled: getBoolEnv('NEXT_PUBLIC_AI_GEMINI_ENABLED', false),
      },
    },
    features: {
      ...defaultConfig.features,
      showPrompts: getBoolEnv('NEXT_PUBLIC_FEATURE_SHOW_PROMPTS', defaultConfig.features.showPrompts),
      showResources: getBoolEnv('NEXT_PUBLIC_FEATURE_SHOW_RESOURCES', defaultConfig.features.showResources),
      showTools: getBoolEnv('NEXT_PUBLIC_FEATURE_SHOW_TOOLS', defaultConfig.features.showTools),
      enableMarkdown: getBoolEnv('NEXT_PUBLIC_FEATURE_ENABLE_MARKDOWN', defaultConfig.features.enableMarkdown),
      enableCodeHighlight: getBoolEnv('NEXT_PUBLIC_FEATURE_ENABLE_CODE_HIGHLIGHT', defaultConfig.features.enableCodeHighlight),
      enableFileDownload: getBoolEnv('NEXT_PUBLIC_FEATURE_ENABLE_FILE_DOWNLOAD', defaultConfig.features.enableFileDownload),
      enableChatHistory: getBoolEnv('NEXT_PUBLIC_FEATURE_ENABLE_CHAT_HISTORY', defaultConfig.features.enableChatHistory),
      enableChatExport: getBoolEnv('NEXT_PUBLIC_FEATURE_ENABLE_CHAT_EXPORT', defaultConfig.features.enableChatExport),
      threadsEnabled: getBoolEnv('NEXT_PUBLIC_THREADS_ENABLED', getBoolEnv('THREADS_ENABLED', false)),
    },
    ui: {
      ...defaultConfig.ui,
      template: getEnv('NEXT_PUBLIC_UI_TEMPLATE', defaultConfig.ui.template) as any,
      layout: getEnv('NEXT_PUBLIC_UI_LAYOUT', defaultConfig.ui.layout) as any,
      maxWidth: getEnv('NEXT_PUBLIC_UI_MAX_WIDTH', defaultConfig.ui.maxWidth),
      borderRadius: getEnv('NEXT_PUBLIC_UI_BORDER_RADIUS', defaultConfig.ui.borderRadius) as any,
      fontSize: getEnv('NEXT_PUBLIC_UI_FONT_SIZE', defaultConfig.ui.fontSize) as any,
      animationsEnabled: getBoolEnv('NEXT_PUBLIC_UI_ANIMATIONS_ENABLED', defaultConfig.ui.animationsEnabled),
      navbar: {
        enabled: getBoolEnv('NEXT_PUBLIC_UI_NAVBAR_ENABLED', defaultConfig.ui.navbar?.enabled ?? true),
        showPrompts: getBoolEnv('NEXT_PUBLIC_UI_NAVBAR_SHOW_PROMPTS', defaultConfig.ui.navbar?.showPrompts ?? true),
        promptsLabel: getEnv('NEXT_PUBLIC_UI_NAVBAR_PROMPTS_LABEL', defaultConfig.ui.navbar?.promptsLabel || 'Available Prompts'),
      },
    },
    focusMode: getBoolEnv('NEXT_PUBLIC_FOCUS_MODE', defaultConfig.focusMode ?? false),
    systemPrompt: getEnv('NEXT_PUBLIC_SYSTEM_PROMPT', defaultConfig.systemPrompt),
  };

  return config;
}

/** When false, hide session-complete UI (description + CTA). Omit/undefined defaults to true. */
export function isSessionCompletedUiEnabled(
  chat?: Pick<NitroChatConfig['chat'], 'sessionCompletedCtaEnabled'> | null,
): boolean {
  return chat?.sessionCompletedCtaEnabled !== false;
}
