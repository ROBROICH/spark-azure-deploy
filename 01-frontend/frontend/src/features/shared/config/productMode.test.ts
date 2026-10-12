import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfiguredProductMode } from './productMode';

afterEach(() => {
  delete window.__APP_CONFIG__;
  vi.unstubAllEnvs();
});

describe('getConfiguredProductMode', () => {
  it('defaults to spark when nothing is configured', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', '');

    expect(getConfiguredProductMode()).toBe('spark');
  });

  it('prefers runtime config over the build-time value', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', 'spark');
    window.__APP_CONFIG__ = { VITE_PRODUCT_MODE: 'ewms' };

    expect(getConfiguredProductMode()).toBe('ewms');
  });

  it('uses the build-time value when runtime config is absent', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', 'ewms');

    expect(getConfiguredProductMode()).toBe('ewms');
  });

  it('treats the exact unreplaced template value as absent', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', 'ewms');
    window.__APP_CONFIG__ = { VITE_PRODUCT_MODE: '__VITE_PRODUCT_MODE__' };

    expect(getConfiguredProductMode()).toBe('ewms');
  });

  it('treats blank and whitespace-only values as absent', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', '   ');
    window.__APP_CONFIG__ = { VITE_PRODUCT_MODE: ' ' };

    expect(getConfiguredProductMode()).toBe('spark');
  });

  it('throws on unsupported nonempty values', () => {
    window.__APP_CONFIG__ = { VITE_PRODUCT_MODE: 'other' };

    expect(() => getConfiguredProductMode()).toThrow(
      'Invalid VITE_PRODUCT_MODE "other"',
    );
  });

  it('throws on invalid runtime config even when the build-time value is valid', () => {
    vi.stubEnv('VITE_PRODUCT_MODE', 'spark');
    window.__APP_CONFIG__ = { VITE_PRODUCT_MODE: 'other' };

    expect(() => getConfiguredProductMode()).toThrow(
      'Invalid VITE_PRODUCT_MODE',
    );
  });
});
