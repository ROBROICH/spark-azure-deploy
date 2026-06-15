import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';

export const DEV_MODE_STORAGE_KEY = 'DEV_MODE';

const devModeSchema = z.boolean();

function resolveRuntimeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('__')) {
    return undefined;
  }

  return trimmed;
}

function normalizeAllowDevModeValue(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function isDevModeAllowed() {
  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeValue = window.__APP_CONFIG__?.ALLOW_DEV_MODE;
  const envValue = import.meta.env.ALLOW_DEV_MODE;

  return normalizeAllowDevModeValue(
    resolveRuntimeValue(runtimeValue) ?? resolveRuntimeValue(envValue),
  );
}

export function isDevModeEnabled() {
  if (!isDevModeAllowed()) {
    return false;
  }

  const rawValue = window.localStorage.getItem(DEV_MODE_STORAGE_KEY);

  if (rawValue === null) {
    return false;
  }

  try {
    return devModeSchema.parse(JSON.parse(rawValue));
  } catch {
    return false;
  }
}

export function useDevMode() {
  const [storedDevMode, setDevMode] = useLocalStorage({
    key: DEV_MODE_STORAGE_KEY,
    initialValue: false,
    schema: devModeSchema,
  });

  return [isDevModeAllowed() && storedDevMode, setDevMode] as const;
}
