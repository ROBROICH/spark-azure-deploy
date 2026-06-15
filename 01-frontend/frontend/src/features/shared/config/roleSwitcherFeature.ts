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

export function isRoleSwitcherFeatureEnabled(): boolean {
  const runtimeValue =
    window.__APP_CONFIG__?.VITE_DANGEROUS_ENABLE_ROLE_SWITCHER;
  const envValue = import.meta.env.VITE_DANGEROUS_ENABLE_ROLE_SWITCHER;
  return normalizeFeatureFlag(
    resolveFeatureFlagValue(runtimeValue) ?? resolveFeatureFlagValue(envValue),
  );
}
