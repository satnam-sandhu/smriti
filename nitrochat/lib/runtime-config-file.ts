import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type RuntimeConfigFileBranding = {
  name?: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
  faviconDark?: string;
  faviconLight?: string;
  fontFamily?: string;
};

/** Minimal shape read from `runtime-config.json` for SSR branding/metadata. */
export type RuntimeConfigFileSnapshot = {
  branding?: RuntimeConfigFileBranding;
  theme_version_2?: unknown;
};

export function getRuntimeConfigPath(): string {
  return process.env.RUNTIME_CONFIG_PATH || join(process.cwd(), 'config', 'runtime-config.json');
}

/** Server-only: parse mounted runtime config (same path as `/api/config`). */
export function readRuntimeConfigFile(): RuntimeConfigFileSnapshot | null {
  if (typeof window !== 'undefined') return null;

  const configPath = getRuntimeConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent) as RuntimeConfigFileSnapshot;
  } catch {
    return null;
  }
}

export function mergeRuntimeFileBranding<T extends RuntimeConfigFileBranding>(
  base: T,
): T {
  const file = readRuntimeConfigFile();
  if (!file?.branding) return base;
  return { ...base, ...file.branding };
}
