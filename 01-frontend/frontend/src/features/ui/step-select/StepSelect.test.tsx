import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { StepSelect, type StepSelectOption } from './StepSelect';

afterEach(() => {
  cleanup();
});

async function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui as never,
  });
  const fvpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/fvp/documents',
    component: () => <div />,
  });
  const mvpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/mvp',
    component: () => <div />,
  });
  const routeTree = rootRoute.addChildren([indexRoute, fvpRoute, mvpRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  render(<RouterProvider router={router} />);
  await router.load();
}

const options: StepSelectOption[] = [
  {
    value: 'fvp',
    code: '1',
    title: 'Formale Vollständigkeitsprüfung',
    to: '/verfahren/$verfahrenId/fvp/documents',
    params: { verfahrenId: 'test-id' },
  },
  {
    value: 'mvp',
    code: '2',
    title: 'Materielle Vollständigkeitsprüfung',
    to: '/verfahren/$verfahrenId/mvp',
    params: { verfahrenId: 'test-id' },
  },
];

describe('StepSelect', () => {
  it('renders the trigger with the selected option label', async () => {
    await renderWithRouter(
      <StepSelect
        value="fvp"
        options={options}
        triggerAriaLabel="Prozessschritt auswählen"
        navAriaLabel="Prozessschritt-Navigation"
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Prozessschritt auswählen: Formale Vollständigkeitsprüfung',
      }),
    ).not.toBeNull();
  });

  it('renders a nav landmark with the correct aria-label', async () => {
    await renderWithRouter(
      <StepSelect
        value="fvp"
        options={options}
        triggerAriaLabel="Prozessschritt auswählen"
        navAriaLabel="Prozessschritt-Navigation"
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Prozessschritt-Navigation' }),
    ).not.toBeNull();
  });

  it('shows options as links when the trigger is clicked', async () => {
    const user = userEvent.setup();

    await renderWithRouter(
      <StepSelect
        value="fvp"
        options={options}
        triggerAriaLabel="Prozessschritt auswählen"
        navAriaLabel="Prozessschritt-Navigation"
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Prozessschritt auswählen: Formale Vollständigkeitsprüfung',
      }),
    );

    expect(
      screen.getByRole('menuitem', {
        name: /Materielle Vollständigkeitsprüfung/i,
      }),
    ).not.toBeNull();
  });
});
