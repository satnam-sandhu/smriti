import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './globals.css';
import { getConfig, type NitroChatConfig } from '@/nitrochat.config';
import {
  firstNonEmptyString,
  getResolvedThemeV2Palette,
  getRuntimeThemeSurface,
  resolveBrandingFaviconForSurface,
  withMergedRuntimeTheme,
  isLightColor,
} from '@/lib/theme-runtime';
import { mergeRuntimeFileBranding, readRuntimeConfigFile } from '@/lib/runtime-config-file';
import { AppToaster } from '@/components/AppToaster';
import { PersistStorageQuotaNotice } from '@/components/PersistStorageQuotaNotice';

export const dynamic = 'force-dynamic';

function resolveLayoutBranding(): NitroChatConfig['branding'] {
  return mergeRuntimeFileBranding(getConfig().branding);
}

export async function generateMetadata(): Promise<Metadata> {
  const config = getConfig();
  const branding = resolveLayoutBranding();
  const fileConfig = readRuntimeConfigFile();
  const themeConfig = fileConfig?.theme_version_2
    ? withMergedRuntimeTheme(config, {
        theme_version_2: fileConfig.theme_version_2,
      } as NitroChatConfig)
    : config;
  const surface = getRuntimeThemeSurface(themeConfig);
  const favicon =
    resolveBrandingFaviconForSurface(branding, surface) ||
    branding.favicon ||
    '/logo_white.png';

  return {
    title: branding.name,
    description: branding.tagline,
    icons: {
      icon: [
        { url: favicon, type: 'image/png' },
        { url: '/favicon.ico', type: 'image/x-icon' },
      ],
    },
  };
}

const layoutConfig = (() => {
  const base = getConfig();
  const fileConfig = readRuntimeConfigFile();
  if (!fileConfig?.theme_version_2) return base;
  return withMergedRuntimeTheme(base, {
    theme_version_2: fileConfig.theme_version_2,
  } as NitroChatConfig);
})();

const initialViewportSurface = getRuntimeThemeSurface(layoutConfig);
const initialViewportPalette = getResolvedThemeV2Palette(
  layoutConfig.theme_version_2,
  initialViewportSurface,
);

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: firstNonEmptyString(initialViewportPalette.brand_color) || '#ffe500',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const runtimeConfig = layoutConfig;
  const branding = mergeRuntimeFileBranding(runtimeConfig.branding);
  /** Match Tailwind `dark:` to resolved theme; avoid always-on `dark` when mode is `light`. */
  const initialSurface = getRuntimeThemeSurface(runtimeConfig);
  const htmlThemeClass = initialSurface === 'dark' ? 'dark' : '';

  // Generate inline CSS variables from build-time `theme_version_2` so the first paint
  // matches the resolved surface. Runtime overrides via `/api/config` are applied later
  // by `applyRuntimeThemeToRoot` (lib/theme-runtime.ts).
  const themeV2 = runtimeConfig.theme_version_2;
  const palette = getResolvedThemeV2Palette(themeV2, initialSurface);
  const adv = palette.advanced_customization;
  const chatAreaBg = adv?.chat_area?.chat_area_background_color;
  const isLight = chatAreaBg ? isLightColor(chatAreaBg) : (initialSurface === 'light');
  const overrides: Array<[string, string | undefined]> = [
    ['--color-primary', palette.brand_color],
    ['--color-accent', palette.brand_color],
    ['--color-header-bg', adv?.header?.header_background_color],
    ['--color-header-text', adv?.header?.header_text_color],
    ['--color-header-subtext', adv?.header?.header_subtext_color],
    ['--color-chat-area-bg', adv?.chat_area?.chat_area_background_color],
    ['--color-background', adv?.chat_area?.chat_area_background_color],
    ['--color-input-bg', adv?.input_area?.input_area_background_color],
    ['--color-input-text', adv?.input_area?.input_area_text_color],
    ['--color-input-placeholder', adv?.input_area?.input_area_placeholder_color],
    ['--color-input-border', adv?.input_area?.input_area_border_color],
    ['--color-input-send-bg', adv?.input_area?.input_area_send_button_background_color],
    ['--color-input-send-icon', adv?.input_area?.input_area_send_button_icon_color],
    ['--color-ai-bubble-bg', adv?.message?.ai_bubble_background_color],
    ['--color-ai-bubble-text', adv?.message?.ai_bubble_text_color],
    ['--color-user-bubble-bg', adv?.message?.user_bubble_background_color],
    ['--color-user-bubble-text', adv?.message?.user_bubble_text_color],
    ['--color-alert-bg', adv?.alerts?.alert_background_color],
    ['--color-alert-text', adv?.alerts?.alert_text_color],
    ['--color-border', adv?.border?.borders_and_dividers_color],
    ['--color-foreground', isLight ? '#1a1a1a' : '#ECECEC'],
    ['--color-muted', isLight ? '#6b7280' : '#B4B4B4'],
    ['--color-muted-foreground', isLight ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)'],
  ];
  const inlineStyles: Record<string, string> = {};
  overrides.forEach(([k, v]) => {
    if (typeof v === 'string' && v.trim().length > 0) {
      inlineStyles[k] = v.trim();
    }
  });
  const cssVariables = runtimeConfig.customCss || '';

  return (
    <html lang="en" className={htmlThemeClass} style={inlineStyles as React.CSSProperties} suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href={
            resolveBrandingFaviconForSurface(branding, initialSurface) ||
            branding.faviconDark ||
            branding.favicon ||
            '/favicon.ico'
          }
          type="image/png"
        />
        <meta httpEquiv="Permissions-Policy" content="microphone=*, camera=(), geolocation=()" />
        {cssVariables && (
          <style
            dangerouslySetInnerHTML={{ __html: cssVariables }}
            suppressHydrationWarning
          />
        )}
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
        <AppToaster />
        <PersistStorageQuotaNotice />
      </body>
    </html>
  );
}

