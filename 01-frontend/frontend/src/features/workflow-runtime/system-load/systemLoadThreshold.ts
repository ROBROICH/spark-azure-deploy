export const DEFAULT_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE = 500;

function resolveConfigValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

function normalizeThreshold(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getSystemLoadDisableThresholdPercentage(): number {
  const runtimeValue =
    window.__APP_CONFIG__?.VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE;
  const envValue = import.meta.env
    .VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE;

  return (
    normalizeThreshold(resolveConfigValue(runtimeValue)) ??
    normalizeThreshold(resolveConfigValue(envValue)) ??
    DEFAULT_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE
  );
}
