import { toast } from '@/features/ui/toast/Toast';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamCard } from './TeamCard';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetchProject: vi.fn(),
  transact: vi.fn(),
  update: vi.fn(),
  useProject: vi.fn(),
  useCanMutateProject: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock(
  '@/api-clients/identity-management-module/@tanstack/react-query.gen',
  () => ({
    replaceProjectAssignmentsAssignProjectsProjectIdAssignmentsPostMutation:
      () => ({}),
  }),
);

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({
    getNodesByType: () => [{ id: 'topic-1', node_type: 'topic' }],
  }),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: () => ({
    data: [
      { id: 'topic-1', node_type: 'topic', name: 'Topic 1', mvp_assignees: [] },
    ],
    isLoading: false,
  }),
}));

vi.mock(
  '@/features/access-control/organization-users/organizationUsers.collection',
  () => ({
    useOrganizationUsers: () => ({
      data: [
        {
          userId: 'owner-1',
          email: 'owner@example.test',
          firstName: 'Owner',
          lastName: 'One',
        },
        {
          userId: 'member-1',
          email: 'member@example.test',
          firstName: 'Member',
          lastName: 'One',
        },
      ],
      isError: false,
      isLoading: false,
    }),
  }),
);

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  projectsCollection: {
    utils: {
      refetchProject: mocks.refetchProject,
    },
  },
  useProject: mocks.useProject,
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: mocks.useCanMutateProject,
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transact,
    update: mocks.update,
  }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('./TeamMembersTable', () => ({
  TeamMembersTable: (props: {
    canMutateProject: boolean;
    onDelete: (member: {
      id: string;
      name: string;
      role: 'owner' | 'member';
    }) => void;
    onEdit: (member: {
      id: string;
      name: string;
      role: 'owner' | 'member';
    }) => void;
  }) => (
    <div>
      {props.canMutateProject ? (
        <>
          <button
            type="button"
            onClick={() =>
              props.onDelete({
                id: 'owner-1',
                name: 'Owner One',
                role: 'owner',
              })
            }
          >
            delete owner
          </button>
          <button
            type="button"
            onClick={() =>
              props.onEdit({
                id: 'owner-1',
                name: 'Owner One',
                role: 'owner',
              })
            }
          >
            edit owner
          </button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock('./AddTeamMemberDialog', () => ({
  AddTeamMemberDialog: (props: {
    open: boolean;
    onAdd: (values: {
      role: 'owner' | 'member';
      topicIds: string[];
      userIds: string[];
    }) => Promise<void>;
  }) =>
    props.open ? (
      <button
        type="button"
        onClick={() => {
          void props
            .onAdd({ role: 'member', topicIds: [], userIds: ['new-user'] })
            .catch(() => undefined);
        }}
      >
        submit add
      </button>
    ) : null,
}));

vi.mock('./DeleteTeamMemberDialog', () => ({
  DeleteTeamMemberDialog: (props: {
    open: boolean;
    onConfirm: () => Promise<void>;
  }) =>
    props.open ? (
      <button
        type="button"
        onClick={() => {
          void props.onConfirm().catch(() => undefined);
        }}
      >
        confirm delete
      </button>
    ) : null,
}));

vi.mock('./EditTeamMemberDialog', () => ({
  EditTeamMemberDialog: (props: {
    onSave: (values: {
      role: 'owner' | 'member';
      topicIds: string[];
    }) => Promise<void>;
    open: boolean;
  }) =>
    props.open ? (
      <button
        type="button"
        onClick={() => {
          void props
            .onSave({ role: 'member', topicIds: [] })
            .catch(() => undefined);
        }}
      >
        save demotion
      </button>
    ) : null,
}));

const createStatusError = (status: number) => {
  const error = new Error(`status ${status}`);
  Object.defineProperty(error, 'status', { value: status });
  return error;
};

beforeEach(() => {
  mocks.mutateAsync.mockReset();
  mocks.refetchProject.mockReset();
  mocks.refetchProject.mockResolvedValue(undefined);
  mocks.transact.mockReset();
  mocks.transact.mockImplementation((callback: () => void) => {
    callback();
    return { isPersisted: { promise: Promise.resolve() } };
  });
  mocks.update.mockReset();
  mocks.useCanMutateProject.mockReset();
  mocks.useCanMutateProject.mockReturnValue({ canMutateProject: true });
  mocks.useProject.mockReset();
  mocks.useProject.mockReturnValue({
    data: {
      id: 'project-1',
      owners: ['owner-1'],
      members: ['member-1'],
    },
    isError: false,
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe('TeamCard mutation error toasts', () => {
  it('hides team mutation entry points when the user cannot mutate the project', () => {
    mocks.useCanMutateProject.mockReturnValue({ canMutateProject: false });

    render(<TeamCard />);

    expect(screen.queryByRole('button', { name: 'Team.addButton' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'delete owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'edit owner' })).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.transact).not.toHaveBeenCalled();
  });

  it('shows the last-owner toast when deleting the final owner returns 400', async () => {
    mocks.mutateAsync.mockRejectedValue(createStatusError(400));

    render(<TeamCard />);

    await userEvent.click(screen.getByRole('button', { name: 'delete owner' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'confirm delete' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Team.userPicker.lastOwnerRemoveError',
      ),
    );
  });

  it('shows the last-owner toast when demoting the final owner returns 400', async () => {
    mocks.mutateAsync.mockRejectedValue(createStatusError(400));

    render(<TeamCard />);

    await userEvent.click(screen.getByRole('button', { name: 'edit owner' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'save demotion' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Team.userPicker.lastOwnerRemoveError',
      ),
    );
  });

  it('shows the save fallback for add 400 errors', async () => {
    mocks.mutateAsync.mockRejectedValue(createStatusError(400));

    render(<TeamCard />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Team.addButton' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'submit add' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Team.userPicker.saveError'),
    );
  });

  it('keeps a committed assignment save separate from a failed project refresh', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    mocks.refetchProject.mockRejectedValue(new Error('refresh failed'));

    render(<TeamCard />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Team.addButton' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'submit add' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Team.userPicker.saveError'),
    );
    expect(mocks.mutateAsync).toHaveBeenCalled();
    expect(mocks.transact).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('blocks team edits when the project snapshot failed to load', async () => {
    mocks.useProject.mockReturnValue({
      data: null,
      isError: true,
      isLoading: false,
    });

    render(<TeamCard />);

    expect(screen.getByText('Team.projectLoadError')).not.toBeNull();
    const addButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Team.addButton',
    });
    expect(addButton.disabled).toBe(true);

    await userEvent.click(addButton);

    expect(screen.queryByRole('button', { name: 'submit add' })).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('does not toast again when a node assignment error was already handled', async () => {
    const handledError = new Error('node mutation failed');
    Object.defineProperty(handledError, 'status', { value: 403 });
    mocks.mutateAsync.mockResolvedValue({ success: true });
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return { isPersisted: { promise: Promise.reject(handledError) } };
    });

    const { showMutationErrorToast, createHandledMutationError } =
      await import('@/integrations/api-clients/mutationErrorToast');

    showMutationErrorToast({
      error: handledError,
      fallbackMessage: 'node fallback',
    });
    const wrappedError = createHandledMutationError(
      'wrapped node error',
      handledError,
    );
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return { isPersisted: { promise: Promise.reject(wrappedError) } };
    });
    vi.mocked(toast.error).mockClear();

    render(<TeamCard />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Team.addButton' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'submit add' }));

    await waitFor(() => expect(mocks.transact).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
