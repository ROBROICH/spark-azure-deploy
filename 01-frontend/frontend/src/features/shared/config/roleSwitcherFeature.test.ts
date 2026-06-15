import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRoleSwitcherFeatureEnabled } from './roleSwitcherFeature';

const ENV_KEY = 'VITE_DANGEROUS_ENABLE_ROLE_SWITCHER';

describe('isRoleSwitcherFeatureEnabled', () => {
  afterEach(() => {
    window.__APP_CONFIG__ = undefined;
    vi.unstubAllEnvs();
  });

  it('is disabled when the flag is absent', () => {
    vi.stubEnv(ENV_KEY, '');

    expect(isRoleSwitcherFeatureEnabled()).toBe(false);
  });

  it('accepts explicit enabled values', () => {
    for (const value of ['1', 'true', 'yes']) {
      vi.stubEnv(ENV_KEY, value);

      expect(isRoleSwitcherFeatureEnabled()).toBe(true);
    }
  });

  it('rejects non-enabled values', () => {
    for (const value of ['false', '0', 'no', 'enabled']) {
      vi.stubEnv(ENV_KEY, value);

      expect(isRoleSwitcherFeatureEnabled()).toBe(false);
    }
  });

  it('prefers runtime config over build-time env', () => {
    vi.stubEnv(ENV_KEY, 'false');
    window.__APP_CONFIG__ = {
      VITE_DANGEROUS_ENABLE_ROLE_SWITCHER: 'true',
    };

    expect(isRoleSwitcherFeatureEnabled()).toBe(true);
  });

  it('uses build-time env when runtime config is still a placeholder', () => {
    vi.stubEnv(ENV_KEY, 'true');
    window.__APP_CONFIG__ = {
      VITE_DANGEROUS_ENABLE_ROLE_SWITCHER:
        '__VITE_DANGEROUS_ENABLE_ROLE_SWITCHER__',
    };

    expect(isRoleSwitcherFeatureEnabled()).toBe(true);
  });
});
