import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import type * as TanStackReactRouter from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectRouteErrorFallback } from './ProjectRouteErrorFallback';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackReactRouter>();

  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock('@/features/shared/DynamicAsset', () => ({
  DynamicAsset: (props: { name: string }) => (
    <div aria-label={`${props.name} media`} />
  ),
}));

afterEach(() => {
  cleanup();
});

describe('verfahren project route', () => {
  it('renders the generic error fallback for non-not-found loader errors', () => {
    render(
      <ProjectRouteErrorFallback error={new Error('boom')} reset={vi.fn()} />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'somethingWentWrong.title',
      }),
    ).not.toBeNull();
    expect(screen.getByText('somethingWentWrong.description')).not.toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'somethingWentWrong.reload',
      }),
    ).not.toBeNull();
    expect(
      screen
        .getByRole('link', {
          name: 'somethingWentWrong.dashboard',
        })
        .getAttribute('href'),
    ).toBe('/');
    expect(screen.queryByRole('heading', { name: '404' })).toBeNull();
  });

  it('renders the project-not-found fallback for project 404 loader errors', async () => {
    const notFoundError = new Error('missing project');
    notFoundError.name = 'ProjectNotFoundError';

    render(<ProjectRouteErrorFallback error={notFoundError} reset={vi.fn()} />);

    expect(
      await screen.findByRole('heading', {
        name: '404',
      }),
    ).not.toBeNull();
    expect(screen.getByText('ProjectRouteError.notFound')).not.toBeNull();
    expect(
      screen
        .getByRole('link', {
          name: 'ProjectRouteError.dashboardCta',
        })
        .getAttribute('href'),
    ).toBe('/');
    expect(screen.queryByText('somethingWentWrong.title')).toBeNull();
  });

  it('does not auto-reload its loader after the initial match', () => {
    const routeFilePath = join(
      process.cwd(),
      'src/routes/verfahren/$verfahrenId/route.tsx',
    );
    const routeSource = readFileSync(routeFilePath, 'utf8');

    expect(routeSource).toContain('shouldReload: false');
  });

  it('remounts the graph provider when the project changes', () => {
    const routeFilePath = join(
      process.cwd(),
      'src/routes/verfahren/$verfahrenId/route.tsx',
    );
    const routeSource = readFileSync(routeFilePath, 'utf8');

    expect(routeSource).toContain('<ProjectGraphProvider key={verfahrenId}');
  });

  it('preloads organization users from the project parent loader', () => {
    const loaderFilePath = join(
      process.cwd(),
      'src/features/project/route/projectRouteLoader.ts',
    );
    const loaderSource = readFileSync(loaderFilePath, 'utf8');

    expect(loaderSource).toContain('organizationUsersCollection.preload()');
  });

  it('surfaces best-effort initialization failures with a toast', () => {
    const loaderFilePath = join(
      process.cwd(),
      'src/features/project/route/projectRouteLoader.ts',
    );
    const loaderSource = readFileSync(loaderFilePath, 'utf8');

    expect(loaderSource).toContain('toast.error(');
    expect(loaderSource).toContain(
      'ProjectRouteError.workflowInitializationFailed',
    );
  });

  it('throws startup request errors into the best-effort handler', () => {
    const loaderFilePath = join(
      process.cwd(),
      'src/features/project/route/projectRouteLoader.ts',
    );
    const loaderSource = readFileSync(loaderFilePath, 'utf8');

    expect(loaderSource.match(/throwOnError: true/g)).toHaveLength(2);
  });

  it('starts project initialization only after the project fetch', () => {
    const loaderFilePath = join(
      process.cwd(),
      'src/features/project/route/projectRouteLoader.ts',
    );
    const loaderSource = readFileSync(loaderFilePath, 'utf8');
    const projectFetchIndex = loaderSource.indexOf(
      'projectsCollection.utils.fetchProject',
    );
    const initializationIndex = loaderSource.indexOf(
      'startProjectRouteWorkflowsBestEffort(params.verfahrenId)',
    );

    expect(projectFetchIndex).not.toBe(-1);
    expect(initializationIndex).not.toBe(-1);
    expect(projectFetchIndex).toBeLessThan(initializationIndex);
  });

  it('keeps swimlane routes inside their lane scroll containers', () => {
    const layoutFilePath = join(
      process.cwd(),
      'src/features/project/route/ProjectRouteLayout.tsx',
    );
    const layoutSource = readFileSync(layoutFilePath, 'utf8');

    expect(layoutSource).toContain('const isSwimlaneRoute =');
    expect(layoutSource).toContain(
      "routeIds.includes('/verfahren/$verfahrenId/mvp')",
    );
    expect(layoutSource).toContain(
      "routeIds.includes('/verfahren/$verfahrenId/ewms/')",
    );
    expect(layoutSource).toContain(
      "isSwimlaneRoute ? 'overflow-y-hidden' : 'overflow-y-auto'",
    );
  });
});
