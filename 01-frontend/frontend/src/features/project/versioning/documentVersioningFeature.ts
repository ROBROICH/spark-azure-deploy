const ENABLED_VALUES = new Set(['1', 'true', 'yes']);

function resolveFeatureFlagValue(value?: string): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

function normalizeFeatureFlag(value?: string): boolean {
  return value ? ENABLED_VALUES.has(value) : false;
}

export function isDocumentVersioningFeatureEnabled(): boolean {
  const runtimeValue =
    window.__APP_CONFIG__?.VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE;
  const envValue = import.meta.env.VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE;
  return normalizeFeatureFlag(
    resolveFeatureFlagValue(runtimeValue) ?? resolveFeatureFlagValue(envValue),
  );
}
