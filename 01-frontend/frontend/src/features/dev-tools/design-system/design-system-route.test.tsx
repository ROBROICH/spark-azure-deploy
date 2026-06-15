import { DEV_MODE_STORAGE_KEY } from '@/features/dev-mode/useDevMode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route } from '@/routes/design-system';

const designSystemRoute = Route as unknown as {
  beforeLoad: () => void;
};

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  notFound: () => new Error('Not Found'),
}));

vi.mock('@/features/dev-tools/design-system/DesignSystem', () => ({
  DesignSystem: () => null,
}));

describe('/design-system route', () => {
  afterEach(() => {
    delete window.__APP_CONFIG__;
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('rejects direct access before dev mode is activated from the logo', () => {
    expect(() => designSystemRoute.beforeLoad()).toThrow('Not Found');
  });

  it('rejects direct access when DEV_MODE is active but ALLOW_DEV_MODE is missing', () => {
    vi.stubEnv('ALLOW_DEV_MODE', '');
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));

    expect(() => designSystemRoute.beforeLoad()).toThrow('Not Found');
  });

  it('allows direct access after dev mode is allowed and activated from the logo', () => {
    window.__APP_CONFIG__ = {
      ALLOW_DEV_MODE: 'true',
    };
    window.localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(true));

    expect(() => designSystemRoute.beforeLoad()).not.toThrow();
  });
});
