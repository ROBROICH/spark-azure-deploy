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
});
