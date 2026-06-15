import { render } from '@testing-library/react';
import type * as TanstackReactRouter from '@tanstack/react-router';
import type * as ReactI18Next from 'react-i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStatus } from '@/features/main-page/data/schemas/project.schema';
import { ListScreen } from './ListScreen';
import userEvent from '@testing-library/user-event';

const routeNavigate = vi.fn();
const useSearchMock = vi.fn();
const projectsTableFeatureMock = vi.fn((_: unknown) => (
  <div>Projects table feature</div>
));
const createProjectFormMock = vi.fn((_: unknown) => null);

vi.mock(
  '@/features/main-page/list-screen/projects-table/ProjectsTableFeature',
  () => ({
    ProjectsTableFeature: (props: unknown) => projectsTableFeatureMock(props),
  }),
);

vi.mock('@/features/main-page/create-project-form/CreateProjectForm', () => ({
  CreateProjectForm: (props: unknown) => createProjectFormMock(props),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactRouter>();

  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    getRouteApi: () => ({
      useNavigate: () => routeNavigate,
      useSearch: () => useSearchMock(),
    }),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactI18Next>();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('ListScreen', () => {
  beforeEach(() => {
    projectsTableFeatureMock.mockClear();
    createProjectFormMock.mockClear();
    routeNavigate.mockClear();
    useSearchMock.mockReturnValue({
      search: '',
      sortColumn: undefined,
      sortDirection: undefined,
      createProject: undefined,
      typeFilter: [],
      statusFilter: [],
      favoriteFilter: [],
      status: ProjectStatus.Offen,
    });
  });

  it('maps the legacy status search param into the shared table filters', () => {
    render(<ListScreen />);

    expect(projectsTableFeatureMock).toHaveBeenCalledTimes(1);

    const [props] = projectsTableFeatureMock.mock.calls[0] as unknown as [
      {
        searchState: {
          statusFilter: string[];
        };
      },
    ];

    expect(props.searchState.statusFilter).toEqual([ProjectStatus.Offen]);
  });

  it('clears the legacy status param when the shared table writes search state', () => {
    render(<ListScreen />);

    expect(projectsTableFeatureMock).toHaveBeenCalledTimes(1);

    const [props] = projectsTableFeatureMock.mock.calls[0] as unknown as [
      {
        navigate: (params: {
          search: (prev: Record<string, unknown>) => Record<string, unknown>;
          resetScroll: boolean;
        }) => void;
      },
    ];

    props.navigate({
      search: (prev) => ({
        ...prev,
        search: 'alpha',
      }),
      resetScroll: false,
    });

    expect(routeNavigate).toHaveBeenCalledTimes(1);

    const [{ search, resetScroll }] = routeNavigate.mock.calls[0] as [
      {
        search: (prev: Record<string, unknown>) => Record<string, unknown>;
        resetScroll: boolean;
      },
    ];

    expect(resetScroll).toBe(false);
    expect(
      search({
        status: ProjectStatus.Offen,
      }),
    ).toEqual({
      search: 'alpha',
      status: undefined,
    });
  });

  it('does not mount CreateProjectForm until the create button is clicked', () => {
    render(<ListScreen />);
    expect(createProjectFormMock).not.toHaveBeenCalled();
  });

  it('navigates to the created project after a successful create', async () => {
    const user = userEvent.setup();
    const { getAllByRole } = render(<ListScreen />);

    const addProjectButton = getAllByRole('button', {
      name: 'addProject',
    }).at(0);
    expect(addProjectButton).toBeDefined();
    await user.click(addProjectButton as HTMLElement);

    expect(createProjectFormMock).toHaveBeenCalledTimes(1);

    const [formProps] = createProjectFormMock.mock.calls[0] as [
      { onSuccess: (id: string) => void },
    ];

    formProps.onSuccess('project-123');

    expect(routeNavigate).toHaveBeenCalledWith({
      to: '/verfahren/$verfahrenId',
      params: { verfahrenId: 'project-123' },
    });
  });
});
