import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'test-project' }),
  }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'projectNavbar.steps.projectOverview': 'Verfahrensübersicht',
          'projectNavbar.steps.ewms': 'EWMS',
          'projectNavbar.steps.formalCompletenessCheck': 'FVP',
          'projectNavbar.steps.materialCompletenessCheck': 'MVP',
          'projectNavbar.steps.legalReview': 'RPB',
          'projectNavbar.stepSelectLabel': 'Process step',
          'projectNavbar.stepSelectNavAriaLabel': 'Process steps',
          'projectNavbar.headerAriaLabel': 'Project navigation',
          'projectNavbar.titles.ewms': 'EWMS',
          'sidebar.openMobileMenu': 'Open menu',
          'sidebar.closeMobileMenu': 'Close menu',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProject: () => ({
    data: { name: 'A39 Neubau', internalProjectNumber: 'A39' },
  }),
}));

vi.mock('@/features/project/project-entry/useProjectEntryAction', () => ({
  // No FVP process started: the EWMS-only stepper must still be visible.
  useProjectEntryAction: () => ({
    hasStartedFvpProcess: false,
    isProjectEntryActionLoading: false,
  }),
}));

vi.mock('@/features/ui/sidebar/Sidebar', () => ({
  useSidebar: () => ({
    openMobile: false,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock('@/features/ui/project-indicator/ProjectIndicator', () => ({
  ProjectIndicator: () => null,
}));

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the component must load only after __APP_CONFIG__ is set.
const { ProjectNavbar } = await import('./ProjectNavbar');

afterEach(() => {
  cleanup();
});

describe('ProjectNavbar in EWMS-only product mode', () => {
  it('shows EWMS as step 1 before any FVP process start', () => {
    render(<ProjectNavbar selectedStep="ewms" />);

    expect(
      screen.getByRole('button', { name: /Process step: EWMS/ }).textContent,
    ).toBe('1EWMS');
  });

  it('offers exactly Verfahrensübersicht and EWMS as step options', async () => {
    const user = userEvent.setup();
    render(<ProjectNavbar selectedStep="ewms" />);

    await user.click(
      screen.getByRole('button', { name: /Process step: EWMS/ }),
    );

    // Step options render as links inside the portal-mounted action menu;
    // identify them by their step titles (the avatar link carries the
    // project name instead).
    const stepTitles = ['Verfahrensübersicht', 'EWMS', 'FVP', 'MVP', 'RPB'];
    const links = (await screen.findAllByRole('link')).filter((link) =>
      stepTitles.some((title) => link.textContent.includes(title)),
    );
    const labels = links.map((link) => link.textContent);
    expect(labels).toHaveLength(2);
    expect(labels.some((text) => text.includes('Verfahrensübersicht'))).toBe(
      true,
    );
    expect(labels.some((text) => text.includes('EWMS'))).toBe(true);
    expect(labels.some((text) => text.includes('FVP'))).toBe(false);
    expect(labels.some((text) => text.includes('MVP'))).toBe(false);
    expect(labels.some((text) => text.includes('RPB'))).toBe(false);
  });
});
