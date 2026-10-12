import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouteDocumentTitle } from './AppRouteDocumentTitle';

const mocks = vi.hoisted(() => ({
  routerState: {
    matches: [{ params: {}, routeId: '/' }],
  },
  translations: {
    'app.title': 'SPARK Workflow',
    'app.titleEwms': 'SPARK Workflow eEWMS',
    'pages.dashboard': 'Dashboard',
  } as Record<string, string>,
}));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options?: {
    select?: (state: typeof mocks.routerState) => unknown;
  }) =>
    options?.select ? options.select(mocks.routerState) : mocks.routerState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => mocks.translations[key] ?? key,
  }),
}));

function renderTitle(configuredMode: 'spark' | 'ewms') {
  window.__APP_CONFIG__ = {
    ...window.__APP_CONFIG__,
    VITE_PRODUCT_MODE: configuredMode,
  };
  render(<AppRouteDocumentTitle />);
}

afterEach(() => {
  cleanup();
  document.title = '';
  mocks.routerState.matches = [{ params: {}, routeId: '/' }];
  delete window.__APP_CONFIG__;
});

describe('AppRouteDocumentTitle in EWMS-only product mode', () => {
  it('writes the page title with the configured SPARK Workflow eEWMS product name', () => {
    renderTitle('ewms');

    expect(document.title).toBe('Dashboard | SPARK Workflow eEWMS');
  });
});
