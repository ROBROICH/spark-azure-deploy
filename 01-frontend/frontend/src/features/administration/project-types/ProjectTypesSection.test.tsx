import '@testing-library/jest-dom/vitest';
import { attachHttpStatusToError } from '@/integrations/api-clients/httpErrorStatus';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectTypesSection } from './ProjectTypesSection';

const mocks = vi.hoisted(() => ({
  createProjectTypes: vi.fn(),
  deleteProjectTypes: vi.fn(),
  duplicateMutateAsync: vi.fn(),
  navigate: vi.fn(),
  refetch: vi.fn(),
  updateProjectTypes: vi.fn(),
  useLiveQuery: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: (...args: unknown[]) => mocks.useLiveQuery(...args),
}));

vi.mock(
  '@/features/project/data/project-types/projectTypes.collection',
  () => ({
    projectTypesCollection: {
      utils: { refetch: (...args: unknown[]) => mocks.refetch(...args) },
    },
  }),
);

vi.mock('@/api-clients/backend', () => ({
  v1ProjectLogicCreateProjectTypes: (...args: unknown[]) =>
    mocks.createProjectTypes(...args),
  v1ProjectLogicDeleteProjectTypes: (...args: unknown[]) =>
    mocks.deleteProjectTypes(...args),
  v1ProjectLogicUpdateProjectTypes: (...args: unknown[]) =>
    mocks.updateProjectTypes(...args),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: (props: {
    children: ReactNode;
    params?: { projectTypeId: string };
    preload?: string;
    to: string;
  }) => (
    <a
      data-preload={props.preload}
      href={
        props.params
          ? props.to.replace('$projectTypeId', props.params.projectTypeId)
          : props.to
      }
    >
      {props.children}
    </a>
  ),
}));

vi.mock('./useDuplicateProjectType', () => ({
  useDuplicateProjectType: () => ({
    isPending: false,
    mutateAsync: mocks.duplicateMutateAsync,
  }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: vi.fn(() => true),
}));

const activeType = {
  id: 'type-1',
  name: 'Windpark',
  active: true,
};

const inactiveType = {
  id: 'type-2',
  name: 'Kohlekraftwerk',
  active: false,
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderSection = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return render(<ProjectTypesSection />, { wrapper });
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.createProjectTypes.mockReset();
  mocks.deleteProjectTypes.mockReset();
  mocks.duplicateMutateAsync.mockReset();
  mocks.navigate.mockReset();
  mocks.refetch.mockReset();
  mocks.updateProjectTypes.mockReset();
  mocks.useLiveQuery.mockReset();
  mocks.duplicateMutateAsync.mockResolvedValue({
    id: 'type-copy',
    name: 'Windpark Kopie',
    active: true,
  });
  mocks.navigate.mockResolvedValue(undefined);
  mocks.createProjectTypes.mockResolvedValue({
    data: [{ id: 't-new', name: 'Solarpark', active: true }],
  });
  mocks.deleteProjectTypes.mockResolvedValue({ data: undefined });
  mocks.updateProjectTypes.mockResolvedValue({
    data: [{ ...activeType, active: false }],
  });
  mocks.useLiveQuery.mockReturnValue({
    data: [activeType, inactiveType],
    isLoading: false,
    isError: false,
  });
});

describe('ProjectTypesSection', () => {
  it('renders project types including an inactive badge', () => {
    renderSection();

    expect(screen.getByText('Windpark')).toBeInTheDocument();
    expect(screen.getByText('Kohlekraftwerk')).toBeInTheDocument();
    expect(screen.getByText('projectTypes.inactiveBadge')).toBeInTheDocument();
  });

  it('exposes an explicit edit action for every project type', () => {
    renderSection();

    const editLinks = screen.getAllByRole('link', {
      name: 'projectTypes.actions.edit',
    });
    expect(editLinks).toHaveLength(2);
    expect(editLinks[0]).toHaveAttribute('href', '/administration/type-1');
    expect(editLinks[1]).toHaveAttribute('href', '/administration/type-2');
    expect(editLinks[0]).toHaveAttribute('data-preload', 'intent');
    expect(editLinks[1]).toHaveAttribute('data-preload', 'intent');
  });

  it('opens the same editor route from the clickable project-type name', () => {
    renderSection();

    const activeTypeLink = screen.getByRole('link', { name: 'Windpark' });
    const inactiveTypeLink = screen.getByRole('link', {
      name: 'Kohlekraftwerk',
    });

    expect(activeTypeLink).toHaveAttribute('href', '/administration/type-1');
    expect(activeTypeLink).toHaveAttribute('data-preload', 'intent');
    expect(inactiveTypeLink).toHaveAttribute('href', '/administration/type-2');
    expect(inactiveTypeLink).toHaveAttribute('data-preload', 'intent');
  });

  it('shows a validation message when creating with an empty name', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByRole('button', { name: 'projectTypes.createButton' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.createDialog.save' }),
    );

    expect(
      await screen.findByText('projectTypes.form.nameRequired'),
    ).toBeInTheDocument();
    expect(mocks.createProjectTypes).not.toHaveBeenCalled();
  });

  it('keeps the create dialog open until the mutation resolves', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      data: { id: string; name: string; active: boolean }[];
    }>();
    mocks.createProjectTypes.mockReturnValue(deferred.promise);
    renderSection();

    await user.click(
      screen.getByRole('button', { name: 'projectTypes.createButton' }),
    );
    await user.type(
      screen.getByLabelText('projectTypes.createDialog.name*'),
      'Solarpark',
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.createDialog.save' }),
    );

    expect(
      screen.getByRole('heading', { name: 'projectTypes.createDialog.title' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'projectTypes.createDialog.save' }),
    ).toBeDisabled();

    deferred.resolve({
      data: [{ id: 't-new', name: 'Solarpark', active: true }],
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: 'projectTypes.createDialog.title',
        }),
      ).not.toBeInTheDocument();
    });
    expect(mocks.createProjectTypes).toHaveBeenCalledWith({
      body: [{ name: 'Solarpark' }],
      throwOnError: true,
    });
  });

  it('shows a loading status, empty copy, and a load error with retry', async () => {
    const user = userEvent.setup();
    mocks.useLiveQuery.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    });
    const { unmount: unmountLoading } = renderSection();
    expect(
      screen.getByRole('status', { name: 'projectTypes.loading' }),
    ).toBeInTheDocument();
    unmountLoading();

    mocks.useLiveQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    const { unmount: unmountEmpty } = renderSection();
    expect(screen.getByText('projectTypes.empty')).toBeInTheDocument();
    unmountEmpty();

    mocks.useLiveQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    });
    renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'projectTypes.loadError',
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.retry' }),
    );
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('renames a project type through the name dialog', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Windpark',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.rename' }),
    );
    const nameInput = screen.getByLabelText('projectTypes.renameDialog.name*');
    await user.clear(nameInput);
    await user.type(nameInput, 'Windpark Nord');
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.renameDialog.save' }),
    );

    await waitFor(() => {
      expect(mocks.updateProjectTypes).toHaveBeenCalledWith({
        body: [{ id: 'type-1', name: 'Windpark Nord', active: true }],
        throwOnError: true,
      });
    });
  });

  it('deletes a project type that is not in use', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Kohlekraftwerk',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.delete' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.deleteDialog.confirm' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );

    await waitFor(() => {
      expect(mocks.deleteProjectTypes).toHaveBeenCalledWith({
        query: { ids: ['type-2'] },
        throwOnError: true,
      });
    });
  });

  it('duplicates a project type and navigates to the new detail route', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Windpark',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.duplicate' }),
    );

    expect(
      screen.getByRole('heading', {
        name: 'projectTypes.duplicateDialog.title',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('projectTypes.duplicateDialog.name*'),
    ).toHaveValue('projectTypes.duplicateName:Windpark');

    await user.click(
      screen.getByRole('button', { name: 'projectTypes.duplicateDialog.save' }),
    );

    await waitFor(() => {
      expect(mocks.duplicateMutateAsync).toHaveBeenCalledWith({
        source: activeType,
        name: 'projectTypes.duplicateName:Windpark',
      });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/administration/$projectTypeId',
      params: { projectTypeId: 'type-copy' },
    });
  });

  it('does not navigate after a rolled-back duplicate failure', async () => {
    const user = userEvent.setup();
    const { ProjectTypeCloneDocumentsError } =
      await import('./duplicateProjectType.errors');
    mocks.duplicateMutateAsync.mockRejectedValue(
      new ProjectTypeCloneDocumentsError(new Error('catalog failed')),
    );
    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Windpark',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.duplicate' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.duplicateDialog.save' }),
    );

    await waitFor(() => {
      expect(mocks.duplicateMutateAsync).toHaveBeenCalled();
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        'projectTypes.duplicate.rollbackFailed:Windpark Kopie',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows a recovery link when duplicate cleanup fails', async () => {
    const user = userEvent.setup();
    const { PartialProjectTypeCloneError } =
      await import('./duplicateProjectType.errors');
    mocks.duplicateMutateAsync.mockRejectedValue(
      new PartialProjectTypeCloneError({
        projectTypeId: 'type-copy',
        projectTypeName: 'Windpark Kopie',
      }),
    );
    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Windpark',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.duplicate' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.duplicateDialog.save' }),
    );

    expect(
      await screen.findByText(
        'projectTypes.duplicate.rollbackFailed:Windpark Kopie',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'projectTypes.duplicate.openPartial',
      }),
    ).toHaveAttribute('href', '/administration/type-copy');
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps the delete dialog open on conflict and deactivates instead', async () => {
    const user = userEvent.setup();
    const conflictError = attachHttpStatusToError(
      {
        message:
          'Project type is referenced by a procedure; deactivate it instead',
      },
      new Response(null, { status: 409 }),
    );
    mocks.deleteProjectTypes.mockRejectedValue(conflictError);

    renderSection();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.actions.menu:Windpark',
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'projectTypes.actions.delete' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'projectTypes.deleteDialog.confirm' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );

    expect(
      await screen.findByText('projectTypes.deleteDialog.conflictTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'projectTypes.deleteDialog.conflictDescription:Windpark',
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'projectTypes.deleteDialog.deactivateInstead',
      }),
    );

    await waitFor(() => {
      expect(mocks.updateProjectTypes).toHaveBeenCalledWith({
        body: [{ id: 'type-1', name: 'Windpark', active: false }],
        throwOnError: true,
      });
    });
  });
});
