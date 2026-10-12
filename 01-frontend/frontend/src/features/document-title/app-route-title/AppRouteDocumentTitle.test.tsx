import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouteDocumentTitle } from './AppRouteDocumentTitle';

const mocks = vi.hoisted(() => ({
  language: 'de' as 'de' | 'en',
  routerState: {
    matches: [{ params: {}, routeId: '/' }],
  },
  translations: {
    de: {
      DocumentTitle: {
        'app.title': 'SPARK Workflow',
        'dev.designSystem': 'Design System',
        'dev.nodes': 'Nodes Dev Tools',
        'pages.accessibility': 'Erklärung zur Barrierefreiheit',
        'pages.administration': 'Administration',
        'pages.changelog': 'Changelog',
        'pages.dashboard': 'Dashboard',
        'pages.loading': 'Laden',
        'pages.notFound': 'Seite nicht gefunden',
        'pages.projectsOverview': 'Verfahrensübersicht',
        'pages.redactionAgent': 'Schwärzungsagent',
        'projectFeatures.ewms': 'Behörden- und Öffentlichkeitsbeteiligung',
        'projectFeatures.formalCompletenessCheck':
          'Formale Vollständigkeitsprüfung',
        'projectFeatures.materialCompletenessCheck':
          'Materielle Vollständigkeitsprüfung',
        'projectFeatures.plausibilityCheck': 'Plausibilitätsprüfung',
        'projectFeatures.projectOverview': 'Verfahrensübersicht',
        'projectFeatures.rpb': 'Rechtliche Prüfung und Beschlusserstellung',
        'projectFeatures.supplementaryRequests': 'Nachforderungsschreiben',
      },
    },
    en: {
      DocumentTitle: {
        'app.title': 'SPARK Workflow',
        'dev.designSystem': 'Design System',
        'dev.nodes': 'Nodes Dev Tools',
        'pages.accessibility': 'Accessibility Statement',
        'pages.administration': 'Administration',
        'pages.changelog': 'Changelog',
        'pages.dashboard': 'Dashboard',
        'pages.loading': 'Loading',
        'pages.notFound': 'Page not found',
        'pages.projectsOverview': 'Projects Overview',
        'pages.redactionAgent': 'Redaction Agent',
        'projectFeatures.ewms': 'Public participation',
        'projectFeatures.formalCompletenessCheck': 'Formal completeness check',
        'projectFeatures.materialCompletenessCheck':
          'Material completeness check',
        'projectFeatures.plausibilityCheck': 'Plausibility check',
        'projectFeatures.projectOverview': 'Project overview',
        'projectFeatures.rpb': 'Legal review and resolution drafting',
        'projectFeatures.supplementaryRequests': 'Supplementary request letter',
      },
    },
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options?: {
    select?: (state: typeof mocks.routerState) => unknown;
  }) =>
    options?.select ? options.select(mocks.routerState) : mocks.routerState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: (namespace: 'DocumentTitle') => ({
    t: (key: string) => {
      const translations = mocks.translations[mocks.language][
        namespace
      ] as Record<string, string>;

      return translations[key] ?? key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  document.title = '';
  mocks.language = 'de';
  mocks.routerState.matches = [{ params: {}, routeId: '/' }];
});

describe('AppRouteDocumentTitle', () => {
  it('writes the page document title from the current route', () => {
    render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Dashboard | SPARK Workflow');
  });

  it('leaves project route titles to the project route owner', () => {
    document.title = 'Existing project title';
    mocks.routerState.matches = [
      { params: {}, routeId: '/verfahren/$verfahrenId' },
      { params: {}, routeId: '/verfahren/$verfahrenId/fvp/documents/' },
    ];

    render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Existing project title');
  });

  it('leaves administration detail titles to the detail route owner', () => {
    document.title = 'Existing administration detail title';
    mocks.routerState.matches = [
      { params: {}, routeId: '/administration/$projectTypeId' },
    ];

    render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Existing administration detail title');
  });

  it('updates the document title when the active language changes', () => {
    mocks.routerState.matches = [{ params: {}, routeId: '/verfahren/' }];
    const { rerender } = render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Verfahrensübersicht | SPARK Workflow');

    mocks.language = 'en';
    rerender(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Projects Overview | SPARK Workflow');
  });

  it('writes the administration title in both supported languages', () => {
    mocks.routerState.matches = [{ params: {}, routeId: '/administration/' }];
    const { rerender } = render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Administration | SPARK Workflow');

    mocks.language = 'en';
    rerender(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Administration | SPARK Workflow');
  });

  it('writes the not found title for unknown non-project routes', () => {
    mocks.routerState.matches = [{ params: {}, routeId: '__root__' }];

    render(<AppRouteDocumentTitle />);

    expect(document.title).toBe('Seite nicht gefunden | SPARK Workflow');
  });
});
