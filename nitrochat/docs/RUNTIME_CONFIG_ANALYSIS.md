# Runtime config deep analysis

Analysis of `config/runtime-config.json`: what is defined, how it flows through the app, and which properties are actually used.

---

## 1. How runtime config is loaded

| Source | When | Where |
|--------|------|--------|
| **`nitrochat.config.ts`** `getConfig()` | Build/SSR and client fallback | Reads **env vars + defaults** only. Does **not** read `runtime-config.json`. |
| **`/api/config`** GET | Client-side after load | Reads **`config/runtime-config.json`** (or `RUNTIME_CONFIG_PATH`), then merges in **persistence** and **gateway** from env, and returns JSON. |
| **`app/page.tsx`** | After fetch | Fetches `/api/config`, then merges with `baseConfig` (from `getConfig()`). Result is the effective client config. |

So:

- **Layout/SSR** (e.g. `app/layout.tsx`): uses **only** `getConfig()` → env + defaults. **Nothing from `runtime-config.json`** is used there.
- **Client app** (main chat page): uses **API response** (file + API-injected props) merged with baseConfig. **Everything from the file that the API returns is “in use”** for that merge; the question is whether any **component** reads each leaf property.

---

## 2. What’s in `runtime-config.json` today

Structure (after cleanup: no `ai`, no `elevenLabs` in file):

```json
{
  "mcp": { "serverUrl": "...", "apiKey": null },
  "branding": { "name", "tagline", "logo", "favicon", "faviconDark", "faviconLight" },
  "theme_version_2": {
    "mode": "light | dark | system_default",
    "logo_url_light": "https://.../logo.png",
    "logo_url_dark": "https://.../logo.png",
    "light": {
      "brand_color": "#...",
      "advanced_customization": {
        "header": { "header_background_color", "header_text_color", "header_subtext_color" },
        "chat_area": { "chat_area_background_color" },
        "input_area": {
          "input_area_background_color",
          "input_area_text_color",
          "input_area_placeholder_color",
          "input_area_border_color",
          "input_area_send_button_background_color",
          "input_area_send_button_icon_color"
        },
        "message": {
          "ai_bubble_background_color",
          "ai_bubble_text_color",
          "user_bubble_background_color",
          "user_bubble_text_color"
        },
        "alerts": { "alert_background_color", "alert_text_color" },
        "border": { "borders_and_dividers_color" }
      }
    },
    "dark": { "brand_color", "advanced_customization": "same shape; omit when mode is light only" },
    "brand_color": "optional legacy fallback for both surfaces",
    "advanced_customization": "optional legacy fallback merged under surface-specific palettes"
  },
  "chat": { "placeholder", "maxMessageLength", "suggestedPrompts" },
  "features": { "showPrompts", "showResources", "showTools" }
}
```

> **Light-only nested config:** if `light` is set and `dark` is omitted, `resolveEffectiveThemeSurface` never returns `dark`, so `html.dark` is not toggled on and palette resolution stays on the light branch (plus legacy root fallbacks). Legacy flat configs (no `light`/`dark` keys) are unchanged.

> **Migration note:** the legacy `theme` key (with `dark`/`light` palettes) is not read by NitroChat. **`theme_version_2`** is the only theme source. Per-surface colors live under **`light`** / **`dark`**; optional root **`brand_color`** / **`advanced_customization`** remain supported as fallbacks for older ConfigMaps and env-only deploys (`lib/theme-runtime.ts` → `getResolvedThemeV2Palette`).

- **`ai`** – Omitted from file when using **gateway**; API sets provider enablement from gateway. For non-gateway deployments you can still add it.
- **`elevenLabs`** – Omitted from file; API key is **env-only** (`ELEVENLABS_API_KEY`); API merges env over config.
- No `ui`, `persistence`, `gateway`, or `customCss` in the file; those are added or supplied elsewhere (see below).

---

## 3. Property-by-property usage

### 3.1 All properties **in** `runtime-config.json` are used

Every key and leaf you have in the file is read somewhere after the client merge:

| Section | Property | Where it’s used |
|---------|----------|------------------|
| **mcp** | `serverUrl` | `app/page.tsx`, `app/embed/page.tsx`, `app/try-embed/page.tsx` – MCP client, fetch URLs |
| **mcp** | `apiKey` | `app/page.tsx`, `app/embed/page.tsx` – `Authorization: Bearer` header |
| **mcp** | `oauth` | Not in file; API merges from env. Used in `app/page.tsx` (setOAuthConfig), `app/embed/page.tsx` (auth flow, tokenEndpoint, authorizationEndpoint, audience, clientId). |
| **branding** | `name` | `layout.tsx` (title), `WelcomeScreen`, `Sidebar`, `ChatInput`/`ChatInputEmbed` disclaimer, templates (logo alt, app name) |
| **branding** | `tagline` | `layout.tsx` (description), `WelcomeScreen`, embed page |
| **branding** | `logo` | `Sidebar`, `WelcomeScreen`, `SidebarTemplate`, `SplitViewTemplate`, `CompactTemplate`, `CenteredTemplate`, embed page |
| **branding** | `favicon` | `layout.tsx` (metadata icons, default icon), `Sidebar` (when no dark/light), merge fallback |
| **branding** | `faviconDark` | `layout.tsx` (link rel=icon), `app/page.tsx` (theme-based favicon), `Sidebar` |
| **branding** | `faviconLight` | `app/page.tsx` (theme-based favicon), `Sidebar` |
| **theme_version_2** | `mode` | `app/page.tsx` – theme mode (`dark`/`light`/`system_default`), `localStorage` key `nitrochat-user-theme`. `system_default` follows OS preference. **`resolveEffectiveThemeSurface`** (with `getRuntimeThemeSurface`, `applyRuntimeThemeToRoot`) sets the `dark` class on `<html>` and logo selection; light-only nested configs (`light` set, `dark` omitted) never enable `html.dark`. |
| **theme_version_2** | `light` / `dark` (`brand_color`, `advanced_customization`) | `lib/theme-runtime.ts` (`getResolvedThemeV2Palette`, `applyRuntimeThemeToRoot`) picks the branch for the active surface, with opposite branch then legacy root as fallbacks → CSS variables `--color-primary`, `--color-accent`, header/chat/input/message/alert/border tokens. |
| **theme_version_2** | `brand_color` / `advanced_customization` at **root** (legacy) | Same resolver: lowest-priority layer when nested branches omit values. `resolveBrandColor` / `public/embed.js` use the resolved surface brand. |
| **theme_version_2** | `logo_url_light` / `logo_url_dark` | `lib/theme-runtime.ts` (`getCustomLogoUrlForSurface`); consumed by `WelcomeScreen`, `Sidebar`, and every template’s header. |
| **theme_version_2** | `light.advanced_customization.header.*` / `dark.…` (merged) | `--color-header-bg`, `--color-header-text`, `--color-header-subtext` |
| **theme_version_2** | `*.advanced_customization.chat_area.*` | `--color-chat-area-bg` (aliased to `--color-background`) |
| **theme_version_2** | `*.advanced_customization.input_area.*` | `--color-input-bg`, `--color-input-text`, `--color-input-placeholder`, `--color-input-send-bg`, `--color-input-send-icon` |
| **theme_version_2** | `*.advanced_customization.message.*` | `--color-user-bubble-bg`, `--color-user-bubble-text`, `--color-ai-bubble-bg`, `--color-ai-bubble-text` |
| **theme_version_2** | `*.advanced_customization.alerts.*` | `--color-alert-bg`, `--color-alert-text` (consumed by `AppToaster`) |
| **theme_version_2** | `*.advanced_customization.border.*` | `--color-border` |
| **chat** | `placeholder` | `ChatInput.tsx`, `ChatInputEmbed.tsx` |
| **chat** | `maxMessageLength` | `ChatInput.tsx`, `ChatInputEmbed.tsx` (`maxLength`) |
| **chat** | `suggestedPrompts` | `WelcomeScreen.tsx` – fetched from `/api/config` and **rendered as clickable chips** (e.g. "What can you help me with?", "demo"); clicking sends that text as the first message. |
| **features** | `showPrompts` | `app/page.tsx` – whether to fetch and show prompts in navbar/sidebar. **Working.** |
| **features** | `showResources` | `app/page.tsx` – whether to fetch and show resources. **Working.** |
| **features** | `showTools` | `app/page.tsx` – whether to fetch and show tools. **Working.** |

**Not in file (by design):** `ai` (redundant when using gateway; API sets from gateway). `elevenLabs` (API key is env-only).

---

## 4. What is **not** in `runtime-config.json` but exists in the app

### 4.1 Injected by the API (never read from the file)

- **`persistence`** – Set in `app/api/config/route.ts` from `MONGODB_URI` / `MONGODB_DB_NAME`. Used in `app/page.tsx` and `SidebarTemplate.tsx`.
- **`gateway`** – Set in same route from `NITROCHAT_GATEWAY_*` env. Used in `app/page.tsx` (model selection, gateway vs direct AI).
- **`mcp.oauth`** – Can be in file, but when `OAUTH_CLIENT_ID` is set the API overwrites/merges from env.

So you don’t need these in the JSON; the API adds them.

### 4.2 From `getConfig()` only (env + defaults) – not from the file

- **`customCss`** – Only read in `app/layout.tsx` via `getConfig()`. So **customCss in `runtime-config.json` would not be used** for layout; only env (or future API → layout) would.
- **`ui`** – Not in your runtime file. Client merge does `...runtimeConfig.ui`, so if you added `ui` to the file it would be used. Today only `config.ui.navbar` is used: `SidebarTemplate.tsx` uses `config.ui.navbar?.promptsLabel`, `config.ui.navbar?.enabled`. Those values come from defaults in `nitrochat.config.ts`, not from the file.

So: **runtime-config.json currently doesn’t define `ui` or `customCss`;** those are env/default only (and for layout, file is not read).

---

## 5. Config that exists in types/defaults but is **never read** in components

These are in `NitroChatConfig` / `defaultConfig` in `nitrochat.config.ts` and can be overridden by env, but **no component** reads them from `config`:

- **chat**: `welcomeMessage`, `enableImageUpload`, `enableVoiceInput`
- **features**: `enableMarkdown`, `enableCodeHighlight`, `enableFileDownload`, `enableChatHistory`, `enableChatExport`
- **ui**: `template`, `layout`, `maxWidth`, `borderRadius`, `fontSize`, `animationsEnabled` (only `ui.navbar` is used)
- **security**: entire block
- **analytics**: entire block

So even if you put these in `runtime-config.json`, they would be merged into client config but **never used** until something is implemented to read them. They’re effectively dead for runtime-config too.

---

## 6. Summary table

| Category | In runtime-config.json? | Used in app? | Notes |
|----------|--------------------------|--------------|--------|
| mcp.serverUrl, apiKey | Yes | Yes | Used for MCP client and auth header. |
| mcp.oauth | No (API from env) | Yes | Injected by API when OAuth env is set. |
| branding.* | Yes | Yes | All six properties used. |
| theme_version_2.* | Yes | Yes | `mode`, logos, nested `light`/`dark` (and legacy root fallbacks); merged in `app/page.tsx` via `withMergedRuntimeTheme`. **`resolveEffectiveThemeSurface`** keeps light-only configs off `html.dark`. |
| chat.placeholder, maxMessageLength, suggestedPrompts | Yes | Yes | Input and welcome screen. |
| chat.welcomeMessage, enableImageUpload, enableVoiceInput | No | No | In type/defaults only; no component reads them. |
| ai.openai.enabled, gemini.enabled | No (omitted when using gateway) | Yes | API sets from gateway when enabled; optional in file for non-gateway. |
| features.showPrompts, showResources, showTools | Yes | Yes | Control prompts/resources/tools in UI; all working. |
| features.enableMarkdown, etc. | No | No | In type/defaults only. |
| elevenLabs.apiKey | No (env only) | Yes | Set via `ELEVENLABS_API_KEY`; not in runtime-config. |
| persistence | No (API from env) | Yes | Injected by API. |
| gateway | No (API from env) | Yes | Injected by API. |
| ui.navbar | No | Yes | From defaultConfig only; could be moved to file. |
| ui.template, layout, etc. | No | No | Not read anywhere. |
| customCss | No | Only via getConfig() | Layout doesn’t use file; file would be ignored for layout. |

---

## 7. Recommendations

1. **Keep the current file as-is** – Every property you have is used; no need to remove anything for “usage.”
2. **Optional: add `ui.navbar` to runtime-config.json** if you want to drive navbar/prompts label from the file instead of only env/defaults.
3. **If you want `customCss` from the file** – Either have the layout read from the same API (e.g. a shared server component that fetches config) or document that `customCss` only works via env / `getConfig()`.
4. **Cleanup (optional)** – Remove or clearly mark as “reserved” the options in `NitroChatConfig` that nothing reads (e.g. `welcomeMessage`, `enableImageUpload`, `features.enable*`, `ui.template`, `security`, `analytics`) so it’s obvious they’re not wired to runtime-config or components yet.

This gives you a precise map of what’s in `runtime-config.json`, what’s used, and what’s only in types/env.
