import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectRouteDocumentTitle } from './ProjectRouteDocumentTitle';

const mocks = vi.hoisted(() => ({
  language: 'de' as 'de' | 'en',
  routerState: {
    matches: [{ routeId: '/verfahren/$verfahrenId' }],
  },
  translations: {
    de: {
      DocumentTitle: {
        'app.title': 'SPARK Workflow',
        'dev.nodes': 'Nodes Dev Tools',
        'projectFeatures.formalCompletenessCheck':
          'Formale Vollständigkeitsprüfung',
        'projectFeatures.projectOverview': 'Verfahrensübersicht',
      },
    },
    en: {
      DocumentTitle: {
        'app.title': 'SPARK Workflow',
        'dev.nodes': 'Nodes Dev Tools',
        'projectFeatures.formalCompletenessCheck': 'Formal completeness check',
        'projectFeatures.projectOverview': 'Project overview',
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
  mocks.routerState.matches = [{ routeId: '/verfahren/$verfahrenId' }];
});

describe('ProjectRouteDocumentTitle', () => {
  it('writes the loader project name and leaf project feature title', () => {
    mocks.routerState.matches = [
      { routeId: '/verfahren/$verfahrenId' },
      { routeId: '/verfahren/$verfahrenId/fvp' },
      { routeId: '/verfahren/$verfahrenId/fvp/documents/' },
    ];

    render(<ProjectRouteDocumentTitle projectName="A8 Aus- und Neubau" />);

    expect(document.title).toBe(
      'A8 Aus- und… | Formale Vollständigkeitsprüfung | SPARK Workflow',
    );
  });

  it('omits a blank project name', () => {
    mocks.routerState.matches = [
      { routeId: '/verfahren/$verfahrenId' },
      { routeId: '/verfahren/$verfahrenId/fvp/documents/' },
    ];

    render(<ProjectRouteDocumentTitle projectName=" " />);

    expect(document.title).toBe(
      'Formale Vollständigkeitsprüfung | SPARK Workflow',
    );
  });

  it('updates when the active language changes', () => {
    const { rerender } = render(
      <ProjectRouteDocumentTitle projectName="A8 Aus- und Neubau" />,
    );

    expect(document.title).toBe(
      'A8 Aus- und… | Verfahrensübersicht | SPARK Workflow',
    );

    mocks.language = 'en';
    rerender(<ProjectRouteDocumentTitle projectName="A8 Aus- und Neubau" />);

    expect(document.title).toBe(
      'A8 Aus- und… | Project overview | SPARK Workflow',
    );
  });
});
