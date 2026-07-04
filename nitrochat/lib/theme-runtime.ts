/**
 * Runtime theme resolution for the `theme_version_2` schema in runtime-config.json.
 *
 * Schema (v2 nested):
 *   theme_version_2 = {
 *     mode: 'light' | 'dark' | 'system_default',
 *     logo_url_light: string,
 *     logo_url_dark: string,
 *     light: { brand_color, advanced_customization: { header, chat_area, input_area, message, alerts, border } },
 *     dark:  { same shape; optional when mode === 'light' or when only `light` is shipped (light-only config).
 *     // Legacy (optional): root brand_color + advanced_customization — treated as fallback for both surfaces.
 *   }
 *
 * **Light-only:** if nested `light` is present and `dark` is omitted, `resolveEffectiveThemeSurface` never
 * returns `dark` (avoids `html.dark` + light palette mismatch when mode is `dark` or OS prefers dark).
 *
 * Resolution (`getResolvedThemeV2Palette`):
 *   For the active surface, merge `advanced_customization` in order: legacy root → opposite surface →
 *   current surface (later wins per field). `brand_color` uses: current branch → opposite branch → legacy root.
 *
 * `mode` sets the preferred surface via `resolveActiveSurface`; **`resolveEffectiveThemeSurface`** (used for
 * DOM, CSS vars, and logos) matches that except for light-only nested configs (see above).
 *
 * **Logos:** `logo_url_light` / `logo_url_dark` are per-surface only (`getThemeV2LogoUrlForSurface` does not
 * fall back to the other theme’s URL).
 */

export type ThemeSurface = 'dark' | 'light';

export interface ThemeV2Header {
  header_background_color?: string;
  header_text_color?: string;
  header_subtext_color?: string;
}

export interface ThemeV2ChatArea {
  chat_area_background_color?: string;
}

export interface ThemeV2InputArea {
  input_area_background_color?: string;
  input_area_text_color?: string;
  input_area_placeholder_color?: string;
  input_area_border_color?: string;
  input_area_send_button_background_color?: string;
  input_area_send_button_icon_color?: string;
}

export interface ThemeV2Message {
  ai_bubble_background_color?: string;
  ai_bubble_text_color?: string;
  user_bubble_background_color?: string;
  user_bubble_text_color?: string;
}

export interface ThemeV2Alerts {
  alert_background_color?: string;
  alert_text_color?: string;
}

export interface ThemeV2Border {
  borders_and_dividers_color?: string;
}

export interface ThemeV2AdvancedCustomization {
  header?: ThemeV2Header;
  chat_area?: ThemeV2ChatArea;
  input_area?: ThemeV2InputArea;
  message?: ThemeV2Message;
  alerts?: ThemeV2Alerts;
  border?: ThemeV2Border;
}

/** Per-surface palette under `theme_version_2.light` / `.dark`. */
export interface ThemeV2SurfacePalette {
  brand_color?: string;
  advanced_customization?: ThemeV2AdvancedCustomization;
}

export interface ThemeV2 {
  mode: 'light' | 'dark' | 'system_default';
  logo_url_light?: string;
  logo_url_dark?: string;
  light?: ThemeV2SurfacePalette;
  dark?: ThemeV2SurfacePalette;
  /** @deprecated Prefer `light` / `dark`; still supported as fallback for both surfaces. */
  brand_color?: string;
  /** @deprecated Prefer nested palettes; merged as lowest-priority layer in resolution. */
  advanced_customization?: ThemeV2AdvancedCustomization;
}

type ConfigWithThemeV2 = {
  theme_version_2?: ThemeV2 | null;
  branding?: { logo?: string | null };
  standaloneMode?: { chatbotLogo?: string | null };
};

/** First non-empty trimmed string from candidates; useful for logo URL resolution. */
export function firstNonEmptyString(
  ...candidates: Array<string | undefined | null>
): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return undefined;
}

function mergeThemeV2AdvancedCustomization(
  base: ThemeV2AdvancedCustomization | undefined,
  over: ThemeV2AdvancedCustomization | undefined,
): ThemeV2AdvancedCustomization | undefined {
  if (!base && !over) return undefined;
  const a = base || {};
  const b = over || {};
  const out: ThemeV2AdvancedCustomization = {
    ...a,
    ...b,
    header: { ...(a.header || {}), ...(b.header || {}) },
    chat_area: { ...(a.chat_area || {}), ...(b.chat_area || {}) },
    input_area: { ...(a.input_area || {}), ...(b.input_area || {}) },
    message: { ...(a.message || {}), ...(b.message || {}) },
    alerts: { ...(a.alerts || {}), ...(b.alerts || {}) },
    border: { ...(a.border || {}), ...(b.border || {}) },
  };
  return Object.values(out).some((v) => v && Object.keys(v).length > 0) ? out : undefined;
}

function mergeThemeV2AdvancedLayers(
  ...layers: Array<ThemeV2AdvancedCustomization | undefined | null>
): ThemeV2AdvancedCustomization | undefined {
  let acc: ThemeV2AdvancedCustomization | undefined;
  for (const layer of layers) {
    if (layer == null) continue;
    acc = mergeThemeV2AdvancedCustomization(acc, layer);
  }
  return acc;
}

/**
 * Effective `brand_color` + `advanced_customization` for a UI surface (light vs dark).
 * Merges legacy root palette, the opposite branch, then the branch for `surface` (highest priority).
 */
export function getResolvedThemeV2Palette(
  themeV2: ThemeV2 | null | undefined,
  surface: ThemeSurface,
): ThemeV2SurfacePalette {
  if (!themeV2) return {};
  const other: ThemeSurface = surface === 'dark' ? 'light' : 'dark';
  const branch = surface === 'dark' ? themeV2.dark : themeV2.light;
  const otherBranch = surface === 'dark' ? themeV2.light : themeV2.dark;

  const advanced_customization = mergeThemeV2AdvancedLayers(
    themeV2.advanced_customization,
    otherBranch?.advanced_customization,
    branch?.advanced_customization,
  );

  const brand_color = firstNonEmptyString(
    branch?.brand_color,
    otherBranch?.brand_color,
    themeV2.brand_color,
  );

  return {
    ...(brand_color ? { brand_color } : {}),
    ...(advanced_customization ? { advanced_customization } : {}),
  };
}

function mergeSurfacePaletteBranch(
  base: ThemeV2SurfacePalette | undefined,
  api: ThemeV2SurfacePalette | undefined,
): ThemeV2SurfacePalette | undefined {
  if (!base && !api) return undefined;
  const mergedAdv = mergeThemeV2AdvancedCustomization(
    base?.advanced_customization,
    api?.advanced_customization,
  );
  const brand = firstNonEmptyString(api?.brand_color, base?.brand_color);
  const out: ThemeV2SurfacePalette = {};
  if (brand) out.brand_color = brand;
  if (mergedAdv) out.advanced_customization = mergedAdv;
  if (!out.brand_color && !out.advanced_customization) return undefined;
  return out;
}

/**
 * Determine the active surface (dark vs light) from `mode`.
 * `system_default` consults `prefers-color-scheme` in the browser; SSR defaults to dark.
 */
export function resolveActiveSurface(themeV2: ThemeV2 | null | undefined): ThemeSurface {
  const mode = themeV2?.mode || 'dark';
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  // system_default
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

/**
 * Surface for DOM (`html.dark`), CSS variables, logos, and inline chrome. When the config is
 * **light-only** (`light` is set, `dark` is omitted) but `resolveActiveSurface` would be `dark`,
 * returns `light` so Tailwind surface matches palette fallbacks. Legacy flat configs (no nested
 * branches) keep `resolveActiveSurface` unchanged.
 */
export function resolveEffectiveThemeSurface(themeV2: ThemeV2 | null | undefined): ThemeSurface {
  const candidate = resolveActiveSurface(themeV2);
  if (candidate === 'dark' && themeV2?.dark == null && themeV2?.light != null) {
    return 'light';
  }
  return candidate;
}

export function getRuntimeThemeSurface(
  config: ConfigWithThemeV2 | null | undefined,
): ThemeSurface {
  return resolveEffectiveThemeSurface(config?.theme_version_2);
}

/**
 * Merge `theme_version_2` from `api` onto `base`: deep-merge legacy `advanced_customization`,
 * deep-merge each of `light` / `dark`, then shallow-merge top-level keys so partial API payloads
 * do not wipe nested groups.
 */
export function withMergedRuntimeTheme<T extends ConfigWithThemeV2>(
  base: T,
  api: T | Record<string, unknown> | null | undefined,
): T {
  if (!api) return base;
  const apiTheme = (api as { theme_version_2?: ThemeV2 | null }).theme_version_2;
  const baseTheme = base.theme_version_2;

  const mergedLegacyAdv = mergeThemeV2AdvancedCustomization(
    baseTheme?.advanced_customization,
    apiTheme?.advanced_customization,
  );

  const mergedLight =
    baseTheme?.light != null || apiTheme?.light != null
      ? mergeSurfacePaletteBranch(baseTheme?.light, apiTheme?.light)
      : undefined;
  const mergedDark =
    baseTheme?.dark != null || apiTheme?.dark != null
      ? mergeSurfacePaletteBranch(baseTheme?.dark, apiTheme?.dark)
      : undefined;

  const mergedTheme: ThemeV2 = {
    ...((baseTheme || {}) as ThemeV2),
    ...((apiTheme || {}) as ThemeV2),
    ...(mergedLegacyAdv ? { advanced_customization: mergedLegacyAdv } : {}),
  };
  if (mergedLight) mergedTheme.light = mergedLight;
  if (mergedDark) mergedTheme.dark = mergedDark;

  return {
    ...(base as object),
    ...(api as object),
    theme_version_2: mergedTheme,
  } as T;
}

/** Default bundled mark in `/public` when no custom logo is configured. */
export const DEFAULT_NITROCHAT_LOGO = '/logo_white.png';

/** @deprecated Use DEFAULT_NITROCHAT_LOGO */
export const STANDALONE_CHATBOT_LOGO_ON_DARK_UI = DEFAULT_NITROCHAT_LOGO;
/** @deprecated Use DEFAULT_NITROCHAT_LOGO */
export const STANDALONE_CHATBOT_LOGO_ON_LIGHT_UI = DEFAULT_NITROCHAT_LOGO;
/** @deprecated Use DEFAULT_NITROCHAT_LOGO */
export const STANDALONE_CHATBOT_LOGO_FALLBACK_DARK = DEFAULT_NITROCHAT_LOGO;
/** @deprecated Use DEFAULT_NITROCHAT_LOGO */
export const STANDALONE_CHATBOT_LOGO_FALLBACK_LIGHT = DEFAULT_NITROCHAT_LOGO;

export function fallbackStandaloneChatbotLogo(_surface: ThemeSurface): string {
  return DEFAULT_NITROCHAT_LOGO;
}

/**
 * `theme_version_2.logo_url_light` / `logo_url_dark` only (no `branding.logo`).
 * Used to decide precedence vs `standaloneMode.chatbotLogo`.
 */
export function getThemeV2LogoUrlForSurface(
  config: ConfigWithThemeV2 | null | undefined,
  surface: ThemeSurface,
): string | undefined {
  const themeV2 = config?.theme_version_2;
  if (surface === 'dark') {
    return firstNonEmptyString(themeV2?.logo_url_dark);
  }
  return firstNonEmptyString(themeV2?.logo_url_light);
}

/**
 * Returns the custom logo URL configured for the given surface, or `undefined` when
 * the user hasn't configured a logo for that surface. Uses only `theme_version_2.logo_url_light`
 * or `logo_url_dark` for the matching surface (no cross-theme fallback), then legacy `branding.logo`.
 *
 * Use this in places that visually branch on "is a custom logo configured?".
 */
export function getCustomLogoUrlForSurface(
  config: ConfigWithThemeV2 | null | undefined,
  surface: ThemeSurface,
): string | undefined {
  return getThemeV2LogoUrlForSurface(config, surface) || firstNonEmptyString(config?.branding?.logo);
}

/**
 * Standalone / embed assistant avatar URL for the active surface — always returns
 * something (falls back to bundled `/public` Nitro marks when no custom logo is set).
 *
 * **`standaloneMode.chatbotLogo` wins over `theme_version_2` logos** if explicitly configured
 * in Standalone Mode settings. Otherwise, the theme_version_2 runtime `logo_url_*` is used,
 * then branding.logo, and finally the fallback default.
 */
export function resolveStandaloneChatbotLogo(
  config: ConfigWithThemeV2 | null | undefined,
  surface: ThemeSurface,
): string {
  return (
    firstNonEmptyString(config?.standaloneMode?.chatbotLogo) ||
    firstNonEmptyString(getThemeV2LogoUrlForSurface(config, surface)) ||
    firstNonEmptyString(config?.branding?.logo) ||
    fallbackStandaloneChatbotLogo(surface)
  );
}

type BrandingFaviconFields = {
  favicon?: string | null;
  faviconDark?: string | null;
  faviconLight?: string | null;
};

/**
 * `faviconDark` / `faviconLight` name **mark ink** (dark vs white asset), not UI theme.
 * Returns the URL that reads on the given UI surface (same contrast rule as chatbot fallbacks).
 */
export function resolveBrandingFaviconForSurface(
  branding: BrandingFaviconFields | undefined,
  surface: ThemeSurface,
): string | undefined {
  const legacy = firstNonEmptyString(branding?.favicon);
  const darkInk = firstNonEmptyString(branding?.faviconDark);
  const lightInk = firstNonEmptyString(branding?.faviconLight);
  if (surface === 'dark') {
    return lightInk || legacy || darkInk;
  }
  return darkInk || legacy || lightInk;
}

export function isLightColor(hex: string | undefined | null): boolean {
  if (!hex) return false;
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return false;
  
  let r = 0, g = 0, b = 0;
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    r = parseInt(cleanHex.substring(0, 1) + cleanHex.substring(0, 1), 16);
    g = parseInt(cleanHex.substring(1, 2) + cleanHex.substring(1, 2), 16);
    b = parseInt(cleanHex.substring(2, 3) + cleanHex.substring(2, 3), 16);
  }
  
  // Calculate relative luminance using standard WCAG formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/**
 * Apply resolved `theme_version_2` colors as CSS variables on `root` and toggle
 * the Tailwind `dark` class to match the active surface.
 *
 * Returns the resolved surface plus the resolved themeV2 (for use elsewhere).
 */
export function applyRuntimeThemeToRoot(
  root: HTMLElement,
  config: ConfigWithThemeV2 | null | undefined,
): { surface: ThemeSurface; themeV2: ThemeV2 | undefined } {
  const themeV2 = config?.theme_version_2 || undefined;
  const surface = resolveEffectiveThemeSurface(themeV2);
  const isDark = surface === 'dark';
  const palette = getResolvedThemeV2Palette(themeV2, surface);

  const set = (key: string, value: string | undefined | null) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v) {
      root.style.setProperty(key, v);
    } else {
      root.style.removeProperty(key);
    }
  };

  set('--color-primary', palette.brand_color);
  set('--color-accent', palette.brand_color);

  const adv = palette.advanced_customization;

  set('--color-header-bg', adv?.header?.header_background_color);
  set('--color-header-text', adv?.header?.header_text_color);
  set('--color-header-subtext', adv?.header?.header_subtext_color);

  set('--color-chat-area-bg', adv?.chat_area?.chat_area_background_color);
  set('--color-background', adv?.chat_area?.chat_area_background_color);

  set('--color-input-bg', adv?.input_area?.input_area_background_color);
  set('--color-input-text', adv?.input_area?.input_area_text_color);
  set('--color-input-placeholder', adv?.input_area?.input_area_placeholder_color);
  set('--color-input-border', adv?.input_area?.input_area_border_color);
  set('--color-input-send-bg', adv?.input_area?.input_area_send_button_background_color);
  set('--color-input-send-icon', adv?.input_area?.input_area_send_button_icon_color);

  set('--color-ai-bubble-bg', adv?.message?.ai_bubble_background_color);
  set('--color-ai-bubble-text', adv?.message?.ai_bubble_text_color);
  set('--color-user-bubble-bg', adv?.message?.user_bubble_background_color);
  set('--color-user-bubble-text', adv?.message?.user_bubble_text_color);

  set('--color-alert-bg', adv?.alerts?.alert_background_color);
  set('--color-alert-text', adv?.alerts?.alert_text_color);

  set('--color-border', adv?.border?.borders_and_dividers_color);

  // Dynamically set foreground/muted color variables based on chat area background contrast
  const chatAreaBg = adv?.chat_area?.chat_area_background_color;
  const isLight = chatAreaBg ? isLightColor(chatAreaBg) : (surface === 'light');
  if (isLight) {
    set('--color-foreground', '#1a1a1a');
    set('--color-muted', '#6b7280');
    set('--color-muted-foreground', 'rgba(0, 0, 0, 0.6)');
  } else {
    set('--color-foreground', '#ECECEC');
    set('--color-muted', '#B4B4B4');
    set('--color-muted-foreground', 'rgba(255, 255, 255, 0.6)');
  }

  root.style.removeProperty('--color-sidebar');

  root.classList.toggle('dark', isDark);

  return { surface, themeV2 };
}

/**
 * Brand color for the active surface (nested palette + legacy fallbacks), for inline styles.
 */
export function resolveBrandColor(
  config: ConfigWithThemeV2 | null | undefined,
): string {
  const themeV2 = config?.theme_version_2;
  const surface = resolveEffectiveThemeSurface(themeV2);
  const palette = getResolvedThemeV2Palette(themeV2, surface);
  return firstNonEmptyString(palette.brand_color) || '#ffe500';
}

/**
 * Header background (`advanced_customization.header.header_background_color`),
 * falling back to brand color. For inline styles on standalone/embed chrome.
 */
export function resolveHeaderBackground(
  config: ConfigWithThemeV2 | null | undefined,
): string {
  const themeV2 = config?.theme_version_2;
  const surface = resolveEffectiveThemeSurface(themeV2);
  const palette = getResolvedThemeV2Palette(themeV2, surface);
  return (
    firstNonEmptyString(palette.advanced_customization?.header?.header_background_color) ||
    resolveBrandColor(config)
  );
}
