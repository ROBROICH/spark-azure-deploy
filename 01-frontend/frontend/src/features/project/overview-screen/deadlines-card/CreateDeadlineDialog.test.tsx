import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDeadlineDialog } from './CreateDeadlineDialog';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock(
  '@/features/project/overview-screen/data/collections/deadlines.collection',
  () => ({
    deadlinesCollection: {
      insert: (...args: unknown[]) => mocks.insert(...args),
    },
  }),
);

const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(
    screen.getByLabelText('Deadlines.form.deadlineType*'),
    'Einwendungsfrist',
  );
  fireEvent.change(screen.getByLabelText('Deadlines.form.startAt*'), {
    target: { value: '2026-04-10' },
  });
  fireEvent.change(screen.getByLabelText('Deadlines.form.endAt*'), {
    target: { value: '2026-05-11' },
  });
};

describe('CreateDeadlineDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => 'new-deadline-id' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('associates validation errors with invalid inputs', async () => {
    const user = userEvent.setup();
    render(
      <CreateDeadlineDialog
        canMutateProject
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Deadlines.createDialog.save' }),
    );

    const deadlineType = screen.getByLabelText('Deadlines.form.deadlineType*');
    expect(deadlineType).toHaveAttribute('aria-invalid', 'true');
    expect(deadlineType).toHaveAttribute(
      'aria-describedby',
      'create-deadline-form-deadlineType-error',
    );
    expect(deadlineType).toHaveAccessibleDescription(
      'Deadlines.form.fieldRequired',
    );
  });

  it('shows the success toast only after the insert transaction persists', async () => {
    const user = userEvent.setup();
    let resolvePersist: () => void = () => {};
    const persisted = new Promise<void>((resolve) => {
      resolvePersist = resolve;
    });
    mocks.insert.mockReturnValue({ isPersisted: { promise: persisted } });

    render(
      <CreateDeadlineDialog
        canMutateProject
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Deadlines.createDialog.save' }),
    );

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    // The dialog must not report success while the create request is still
    // in flight.
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Deadlines.createDialog.save' }),
    ).toBeDisabled();

    resolvePersist();
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Deadlines.createSuccess',
      ),
    );
  });

  it('keeps the dialog open and shows an error toast when persistence fails', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mocks.insert.mockImplementation(() => ({
      isPersisted: { promise: Promise.reject(new Error('persist failed')) },
    }));

    render(
      <CreateDeadlineDialog
        canMutateProject
        projectId="project-1"
        open
        onOpenChange={onOpenChange}
      />,
    );

    await fillValidForm(user);
    await user.click(
      screen.getByRole('button', { name: 'Deadlines.createDialog.save' }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Deadlines.createError'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    // The unsaved draft survives the failure so the user can retry.
    expect(screen.getByLabelText('Deadlines.form.deadlineType*')).toHaveValue(
      'Einwendungsfrist',
    );
  });
});
