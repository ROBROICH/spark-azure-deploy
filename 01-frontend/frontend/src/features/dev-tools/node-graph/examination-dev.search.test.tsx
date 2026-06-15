import { cleanup, render, screen } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { examinationDevSearchSchema } from '@/routes/verfahren/$verfahrenId/examination-dev';

afterEach(cleanup);

async function renderWithRouter(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const examinationDevRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/examination-dev',
    validateSearch: examinationDevSearchSchema,
    component: function TestConsumer() {
      const { selectedGraphNodeId, showDescendants } =
        examinationDevRoute.useSearch();

      return (
        <>
          <span data-testid="show-descendants">{String(showDescendants)}</span>
          <span data-testid="selected-graph-node-id">
            {selectedGraphNodeId}
          </span>
        </>
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([examinationDevRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  render(<RouterProvider router={router} />);
  await router.load();

  return router;
}

describe('examinationDevSearchSchema', () => {
  it('defaults showDescendants to false when the URL does not request descendant loading', async () => {
    await renderWithRouter('/verfahren/project-1/examination-dev');

    expect(screen.getByTestId('show-descendants').textContent).toBe('false');
  });

  it('reads showDescendants=true from the URL so copied links reopen descendants', async () => {
    await renderWithRouter(
      '/verfahren/project-1/examination-dev?showDescendants=true',
    );

    expect(screen.getByTestId('show-descendants').textContent).toBe('true');
  });

  it('falls back to false when showDescendants is invalid in the URL', async () => {
    await renderWithRouter(
      '/verfahren/project-1/examination-dev?showDescendants=invalid',
    );

    expect(screen.getByTestId('show-descendants').textContent).toBe('false');
  });

  it('defaults selectedGraphNodeId to an empty string', async () => {
    await renderWithRouter('/verfahren/project-1/examination-dev');

    expect(screen.getByTestId('selected-graph-node-id').textContent).toBe('');
  });

  it('reads selectedGraphNodeId from the URL so copied graph selections reopen in both tabs', async () => {
    await renderWithRouter(
      '/verfahren/project-1/examination-dev?selectedGraphNodeId=node-1',
    );

    expect(screen.getByTestId('selected-graph-node-id').textContent).toBe(
      'node-1',
    );
  });
});
