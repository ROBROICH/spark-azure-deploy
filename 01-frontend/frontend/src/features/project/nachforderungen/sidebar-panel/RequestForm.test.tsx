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
