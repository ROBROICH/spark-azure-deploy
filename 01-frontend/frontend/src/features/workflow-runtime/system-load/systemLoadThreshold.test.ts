import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE,
  getSystemLoadDisableThresholdPercentage,
} from './systemLoadThreshold';

const ENV_KEY = 'VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE';

describe('getSystemLoadDisableThresholdPercentage', () => {
  afterEach(() => {
    window.__APP_CONFIG__ = undefined;
    vi.unstubAllEnvs();
  });

  it('falls back to the default when no threshold is configured', () => {
    vi.stubEnv(ENV_KEY, '');

    expect(getSystemLoadDisableThresholdPercentage()).toBe(
      DEFAULT_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE,
    );
  });

  it('prefers runtime config over build-time env', () => {
    vi.stubEnv(ENV_KEY, '400');
    window.__APP_CONFIG__ = {
      VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE: '300',
    };

    expect(getSystemLoadDisableThresholdPercentage()).toBe(300);
  });

  it('uses build-time env when runtime config is still a placeholder', () => {
    vi.stubEnv(ENV_KEY, '350.5');
    window.__APP_CONFIG__ = {
      VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE:
        '__VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE__',
    };

    expect(getSystemLoadDisableThresholdPercentage()).toBe(350.5);
  });

  it('falls back to the default for invalid values', () => {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '300%', '3,5']) {
      vi.stubEnv(ENV_KEY, value);

      expect(getSystemLoadDisableThresholdPercentage()).toBe(
        DEFAULT_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE,
      );
    }
  });
});
