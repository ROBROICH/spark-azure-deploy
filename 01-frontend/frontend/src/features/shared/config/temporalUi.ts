function normalizeTemporalUiBaseUrl(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('VITE_TEMPORAL_UI_BASE_URL is required');
  }

  return trimmed.replace(/\/+$/, '');
}

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

export function getTemporalWorkflowBaseUrl(): string {
  const runtimeBaseUrl = window.__APP_CONFIG__?.VITE_TEMPORAL_UI_BASE_URL;
  const envBaseUrl = import.meta.env.VITE_TEMPORAL_UI_BASE_URL;
  return normalizeTemporalUiBaseUrl(
    resolveRuntimeValue(runtimeBaseUrl) ?? resolveRuntimeValue(envBaseUrl),
  );
}
