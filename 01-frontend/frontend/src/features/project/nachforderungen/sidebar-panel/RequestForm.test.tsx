import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/features/ui/toast/Toast';
import { addRequestItem } from '@/features/project/nachforderungen/data/actions/requestItemActions';
import { RequestForm } from './RequestForm';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock(
  '@/features/project/nachforderungen/data/actions/requestItemActions',
  () => ({
    addRequestItem: vi.fn(),
    editRequestItem: vi.fn(),
  }),
);

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RequestForm priority radio group accessibility', () => {
  it('exposes the priority radiogroup with the visible label as its accessible name', () => {
    render(<RequestForm onClose={() => {}} canMutateProject />);

    // The radiogroup must be programmatically named by the visible label so
    // assistive tech announces the group purpose, not just the option labels.
    const radioGroup = screen.getByRole('radiogroup', {
      name: 'RequestListPanel.form.priorityLabel',
    });
    expect(radioGroup).toBeInTheDocument();
  });

  it('shows the duplicate-source toast when creating a request returns 409 Conflict', async () => {
    const user = userEvent.setup();
    vi.mocked(addRequestItem).mockRejectedValueOnce({ status: 409 });

    render(<RequestForm onClose={() => {}} canMutateProject />);

    await user.type(
      screen.getByLabelText('RequestListPanel.form.titleLabel'),
      '§ 5 Absatz 1 Satz 1 BauGB',
    );
    await user.type(
      screen.getByLabelText('RequestListPanel.form.reasonLabel'),
      '123',
    );
    await user.click(
      screen.getByRole('button', { name: 'RequestListPanel.form.save' }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'RequestListPanel.form.duplicateSourceError',
      );
    });
    expect(toast.error).not.toHaveBeenCalledWith(
      'RequestListPanel.form.saveError',
    );
  });
});

describe('RequestForm priority change', () => {
  it('saves a "should" request on the first submit after the priority change', async () => {
    const user = userEvent.setup();
    vi.mocked(addRequestItem).mockResolvedValueOnce(undefined);

    // A pre-filled title focuses the empty reason field, as when a
    // contradiction is filed from the plausibility check.
    render(
      <RequestForm
        onClose={() => {}}
        canMutateProject
        initialTitle="WA-0001"
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'RequestListPanel.priority.should' }),
    );
    expect(
      screen.queryByText('RequestListPanel.form.validation.reasonRequired'),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('RequestListPanel.form.reasonLabel'),
      'Widerspruch klären',
    );
    await user.click(
      screen.getByRole('button', { name: 'RequestListPanel.form.save' }),
    );

    await waitFor(() => {
      expect(addRequestItem).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(addRequestItem).mock.calls[0]?.slice(0, 4)).toEqual([
      'project-1',
      'should',
      'WA-0001',
      'Widerspruch klären',
    ]);
  });
});

describe('RequestForm saving state', () => {
  it('marks the save button busy until saving finishes', async () => {
    const user = userEvent.setup();
    let finishSave = () => {};
    vi.mocked(addRequestItem).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );

    render(
      <RequestForm
        onClose={() => {}}
        canMutateProject
        initialTitle="WA-0001"
      />,
    );
    await user.type(
      screen.getByLabelText('RequestListPanel.form.reasonLabel'),
      'Widerspruch klären',
    );
    const saveButton = screen.getByRole('button', {
      name: 'RequestListPanel.form.save',
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toHaveAttribute('aria-busy', 'true');
    });
    expect(saveButton).toBeDisabled();

    finishSave();
    await waitFor(() => {
      expect(saveButton).toHaveAttribute('aria-busy', 'false');
    });
  });
});
