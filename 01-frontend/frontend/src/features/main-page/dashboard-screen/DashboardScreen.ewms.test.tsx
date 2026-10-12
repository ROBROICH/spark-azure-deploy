import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// EWMS-only deployment mode must be configured before the product-mode
// snapshot is first read; the snapshot is cached per document.
window.__APP_CONFIG__ = {
  ...window.__APP_CONFIG__,
  VITE_PRODUCT_MODE: 'ewms',
};

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => vi.fn(),
    useSearch: () => ({}),
  }),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: () => ({ displayName: 'Test User' }),
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProjectList: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/features/project/data/project-favorites/useFavorites', () => ({
  useFavorites: () => ({ favoriteIds: [] }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          welcome: 'Welcome',
          welcomeSubtitle: 'SPARK Workflow',
          welcomeSubtitleEwms: 'SPARK Workflow eEWMS',
          newProject: 'New Project',
          deadlinesAndDates: 'Deadlines & Dates',
          schwarzagent: 'Redaction Agent',
          tryNow: 'Try now',
          myProjects: 'My projects',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

// The calendar widget owns deadline data loading; the dashboard must not mount
// it in EWMS-only mode. Rendered text stands in for the observable section.
vi.mock('../calendar-widget/CalendarWidget', () => ({
  CalendarWidget: () => <div>Calendar widget content</div>,
}));

vi.mock('../create-project-form/CreateProjectForm', () => ({
  CreateProjectForm: () => null,
}));

vi.mock('../list-screen/projects-table/ProjectsTableFeature', () => ({
  ProjectsTableFeature: () => <div>Projects table content</div>,
}));

vi.mock('./FavoritesSection', () => ({
  FavoritesSection: () => <div>Favorites section content</div>,
}));

// Dynamic import is required: the product-mode snapshot is cached on first
// read, so the component must load only after __APP_CONFIG__ is set.
const { DashboardScreen } = await import('./DashboardScreen');

afterEach(() => {
  cleanup();
});

describe('DashboardScreen in EWMS-only product mode', () => {
  it('shows the EWMS dashboard without excluded promotions or deadlines', () => {
    render(<DashboardScreen />);

    expect(screen.getByText('SPARK Workflow eEWMS')).toBeTruthy();
    expect(screen.queryByText('SPARK Workflow')).toBeNull();
    expect(screen.queryByText('Redaction Agent')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try now' })).toBeNull();
    expect(screen.queryByText('Deadlines & Dates')).toBeNull();
    expect(screen.queryByText('Calendar widget content')).toBeNull();
    expect(screen.getByText('Favorites section content')).toBeTruthy();
    expect(screen.getByText('Projects table content')).toBeTruthy();
  });
});
