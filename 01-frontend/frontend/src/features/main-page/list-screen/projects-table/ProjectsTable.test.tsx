import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TanstackReactRouter from '@tanstack/react-router';
import type * as ReactI18Next from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../data/schemas/project.schema';
import { ProjectsTable } from './ProjectsTable';

const retryMock = vi.fn();
const featureContextMock = vi.fn();
const useOrganizationUsersMock = vi.fn();

vi.mock('./ProjectsTableFeatureContext', () => ({
  useProjectsTableFeatureContext: () => featureContextMock(),
}));

vi.mock(
  '@/features/access-control/organization-users/organizationUsers.collection',
  () => ({
    useOrganizationUsers: () => useOrganizationUsersMock(),
  }),
);

vi.mock('@/i18n/dateLocale', () => ({
  getDateLocale: () => 'de-DE',
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactRouter>();

  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactI18Next>();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { column?: string }) =>
        options?.column ? `${key}[${options.column}]` : key,
      i18n: { language: 'de' },
    }),
  };
});

const baseContext = {
  routeState: {
    sortColumn: 'name',
    sortDirection: 'asc' as const,
    onSortChange: vi.fn(),
  },
  favoriteIds: [],
  canFavorite: true,
  onToggleFavorite: vi.fn(),
  projects: [],
  isLoading: false,
  isError: false,
  retry: retryMock,
};

const makeProject = (index: number): Project => ({
  id: `project-${index}`,
  name: `Project ${index}`,
  internalProjectNumber: `AZ-${index}`,
  projectTypeId: 'type-1',
  projectTypeName: 'Type A',
  createdById: 'creator-1',
  statusId: 'status-1',
  statusName: 'Offen',
  createdAt: '2024-01-01T00:00:00Z',
  originalCreatedAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  entryDate: '2024-01-01',
  projectVersion: 1,
  latestVersion: 1,
  owners: [],
  members: [],
});

describe('ProjectsTable', () => {
  afterEach(cleanup);

  beforeEach(() => {
    retryMock.mockClear();
    featureContextMock.mockReset();
    useOrganizationUsersMock.mockReset();
    useOrganizationUsersMock.mockReturnValue({ data: [], isError: false });
  });

  it('renders a retryable error state instead of an empty table when loading fails', async () => {
    const user = userEvent.setup();
    featureContextMock.mockReturnValue({ ...baseContext, isError: true });

    render(<ProjectsTable />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ProjectsTable.loadError',
    );
    expect(
      screen.queryByText('ProjectsTable.noProjectsFound'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('announces the loading state via a status region', () => {
    featureContextMock.mockReturnValue({ ...baseContext, isLoading: true });

    render(<ProjectsTable />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('ProjectsTable.loadingProjects');
  });

  it('renders the empty-state row when there are no projects and no error', () => {
    featureContextMock.mockReturnValue(baseContext);

    render(<ProjectsTable />);

    expect(
      screen.getByText('ProjectsTable.noProjectsFound'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('exposes sort affordance and state on column header buttons', () => {
    featureContextMock.mockReturnValue({
      ...baseContext,
      projects: [makeProject(0)],
    });

    render(<ProjectsTable />);

    expect(
      screen.getByRole('button', {
        name: 'ProjectsTable.sortHeaderAscending[ProjectsTable.projectName]',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'ProjectsTable.sortHeader[ProjectsTable.status]',
      }),
    ).toBeInTheDocument();
    const statusHeader = screen.getByRole('columnheader', {
      name: 'ProjectsTable.status',
    });
    expect(statusHeader).toHaveAttribute('aria-sort', 'none');
    expect(
      screen
        .getAllByRole('columnheader')
        .find((header) => header.getAttribute('aria-sort') === 'ascending'),
    ).toContainElement(
      screen.getByRole('button', {
        name: 'ProjectsTable.sortHeaderAscending[ProjectsTable.projectName]',
      }),
    );
  });

  it('lets large project lists expand without a nested scroll region', () => {
    featureContextMock.mockReturnValue({
      ...baseContext,
      projects: Array.from({ length: 60 }, (_, index) => makeProject(index)),
    });

    render(<ProjectsTable />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(61);
  });

  it('updates favorite star state when the favorite ids change after a toggle', () => {
    featureContextMock.mockReturnValue({
      ...baseContext,
      projects: [makeProject(0)],
    });

    const { rerender } = render(<ProjectsTable />);

    expect(
      screen.getByRole('button', { name: 'ProjectsTable.favoriteProject' }),
    ).toHaveAttribute('aria-pressed', 'false');

    featureContextMock.mockReturnValue({
      ...baseContext,
      favoriteIds: ['project-0'],
      projects: [makeProject(0)],
    });

    rerender(<ProjectsTable />);

    expect(
      screen.getByRole('button', { name: 'ProjectsTable.unfavoriteProject' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
