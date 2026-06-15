import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_MODE_STORAGE_KEY,
  isDevModeAllowed,
  isDevModeEnabled,
} from './useDevMode';

afterEach(() => {
  delete window.__APP_CONFIG__;
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe('dev mode gate', () => {
  it('does not allow dev mode when ALLOW_DEV_MODE is absent', () => {
    vi.stubEnv('ALLOW_DEV_MODE', '');
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));

    expect(isDevModeAllowed()).toBe(false);
    expect(isDevModeEnabled()).toBe(false);
  });

  it('allows dev mode only when ALLOW_DEV_MODE is true and DEV_MODE is true', () => {
    window.__APP_CONFIG__ = {
      ALLOW_DEV_MODE: 'true',
    };
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));

    expect(isDevModeAllowed()).toBe(true);
    expect(isDevModeEnabled()).toBe(true);
  });

  it('keeps dev mode disabled when ALLOW_DEV_MODE is true but DEV_MODE is invalid', () => {
    window.__APP_CONFIG__ = {
      ALLOW_DEV_MODE: 'true',
    };
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify('true'));

    expect(isDevModeEnabled()).toBe(false);
  });
});
