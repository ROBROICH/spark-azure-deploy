import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import type { CellContext } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import type * as TanstackReactRouter from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../data/schemas/project.schema';
import { createProjectsTableColumns } from './ProjectsTable.columns';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactRouter>();

  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
});

const t = ((key: string, options?: { defaultValue?: string }) => {
  if (key === 'FavoriteCard.Offen') {
    return 'Open';
  }
  return options?.defaultValue ?? key;
}) as unknown as TFunction<'Dashboard'>;

const baseProject = {
  id: 'project-1',
  name: 'Alpha',
  internalProjectNumber: 'AZ-1',
  projectTypeName: 'Type A',
  statusName: 'Offen',
  originalCreatedAt: '2024-01-15T00:00:00.000Z',
  owners: [],
  members: [],
} as unknown as Project;

const buildColumns = () =>
  createProjectsTableColumns({
    t,
    locale: 'en-GB',
    users: [],
    usersIsError: false,
  });

const renderCellOutput = (node: unknown) => render(node as ReactElement);

describe('createProjectsTableColumns status cell', () => {
  afterEach(cleanup);

  it('renders the translated status label instead of the raw backend status', () => {
    const columns = buildColumns();
    const statusColumn = columns.find((column) => column.id === 'statusName');

    expect(statusColumn).toBeDefined();

    const cellRenderer = statusColumn?.cell as (
      ctx: Pick<CellContext<Project, unknown>, 'row'>,
    ) => ReactElement;

    const { getByText, queryByText } = renderCellOutput(
      cellRenderer({
        row: { original: baseProject },
      } as CellContext<Project, unknown>),
    );

    expect(getByText('Open')).toBeInTheDocument();
    expect(queryByText('Offen')).not.toBeInTheDocument();
  });

  it('keeps the raw backend status as the value the table filters on', () => {
    const columns = buildColumns();
    const statusColumn = columns.find((column) => column.id === 'statusName');

    const accessor = (statusColumn as { accessorFn?: (row: Project) => string })
      .accessorFn;

    expect(accessor).toBeDefined();
    // The accessor (used by sorting/filtering) returns the raw backend value.
    expect(accessor?.(baseProject)).toBe('Offen');
  });
});
