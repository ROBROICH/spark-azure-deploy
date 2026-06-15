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

export function isMaintenanceModeEnabled(): boolean {
  const runtimeValue = window.__APP_CONFIG__?.VITE_ENABLE_MAINTENANCE_MODE;
  const envValue = import.meta.env.VITE_ENABLE_MAINTENANCE_MODE;
  return normalizeFeatureFlag(
    resolveFeatureFlagValue(runtimeValue) ?? resolveFeatureFlagValue(envValue),
  );
}
