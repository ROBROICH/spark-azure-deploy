import '@testing-library/jest-dom/vitest';
import { client } from '@/api-clients/backend/client.gen';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactI18next from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditDeadlineDialog } from './EditDeadlineDialog';

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18next>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const deadline = {
  id: 'deadline-1',
  projectId: 'project-1',
  deadlineType: 'Einwendungsfrist',
  startAt: '2026-04-10',
  endAt: '2026-05-11',
  legalBasis: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};
const originalClientConfig = client.getConfig();
const save = () =>
  screen.getByRole('button', { name: 'Deadlines.editDialog.save' });

describe('EditDeadlineDialog', () => {
  afterEach(() => {
    cleanup();
    client.setConfig(originalClientConfig);
    vi.clearAllMocks();
  });

  it('reports success only after the server accepts the update', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    let completeRequest!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      completeRequest = resolve;
    });
    client.setConfig({
      baseUrl: 'http://deadlines.test',
      fetch: () => pending,
    });
    render(
      <EditDeadlineDialog
        canMutateProject
        deadline={deadline}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(save());
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();
    completeRequest(Response.json(deadline));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Deadlines.updateSuccess',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the unsaved edit open when the server rejects it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    client.setConfig({
      baseUrl: 'http://deadlines.test',
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    });
    render(
      <EditDeadlineDialog
        canMutateProject
        deadline={deadline}
        onOpenChange={onOpenChange}
      />,
    );

    await user.clear(screen.getByLabelText('Deadlines.form.deadlineType*'));
    await user.type(
      screen.getByLabelText('Deadlines.form.deadlineType*'),
      'Anhörungsfrist',
    );
    await user.click(save());
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Deadlines.updateError'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Deadlines.form.deadlineType*')).toHaveValue(
      'Anhörungsfrist',
    );
  });
});
