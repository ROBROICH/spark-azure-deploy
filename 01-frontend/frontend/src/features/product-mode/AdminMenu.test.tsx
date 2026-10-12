import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/features/ui/sidebar/Sidebar';
import i18n from '@/i18n/config';
import { AdminMenu } from './AdminMenu';
import type * as RouterModule from '@tanstack/react-router';

const state = vi.hoisted(() => ({
  location: { publicHref: '/app/verfahren/p1/mvp?topic=1#detail' },
}));
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual<typeof RouterModule>('@tanstack/react-router')),
  useRouterState: (options: { select: (value: typeof state) => unknown }) =>
    options.select(state),
}));

beforeEach(async () => {
  await i18n.changeLanguage('de');
  vi.stubEnv('VITE_PRODUCT_DOMAIN', 'example.com');
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('location', new URL('https://ewms.test.example.com/app/'));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('offers the current route in the other deployment as a keyboard-accessible new-tab link', async () => {
  const user = userEvent.setup();
  const view = render(
    <SidebarProvider defaultOpen={false}>
      <AdminMenu />
    </SidebarProvider>,
  );
  const trigger = screen.getByRole('button', {
    name: i18n.t('ProductMode:adminMenu'),
  });
  trigger.focus();
  await user.keyboard('{Enter}');
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute(
    'href',
    'https://dashboard.test.example.com/app/verfahren/p1/mvp?topic=1#detail',
  );
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  state.location.publicHref = '/app/verfahren/p2/rpb?view=pdf#page-3';
  view.rerender(
    <SidebarProvider defaultOpen={false}>
      <AdminMenu />
    </SidebarProvider>,
  );
  expect(link).toHaveAttribute(
    'href',
    'https://dashboard.test.example.com/app/verfahren/p2/rpb?view=pdf#page-3',
  );
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
