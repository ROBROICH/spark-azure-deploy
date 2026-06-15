const DEFAULT_APP_BASE_PATH = '/app';

function normalizeAppBasePath(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_APP_BASE_PATH;
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '') || DEFAULT_APP_BASE_PATH;
}

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

export function getAppBasePath(): string {
  const runtimeBasePath = window.__APP_CONFIG__?.VITE_APP_BASE_PATH;
  const envBasePath = import.meta.env.VITE_APP_BASE_PATH;
  return normalizeAppBasePath(
    resolveRuntimeValue(runtimeBasePath) ?? resolveRuntimeValue(envBasePath),
  );
}
