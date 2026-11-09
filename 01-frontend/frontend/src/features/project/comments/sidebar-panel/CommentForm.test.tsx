import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addComment } from '@/features/project/comments/data/actions/commentActions';
import { toast } from '@/features/ui/toast/Toast';
import { CommentForm } from './CommentForm';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@/features/project/comments/data/actions/commentActions', () => ({
  addComment: vi.fn(),
  editComment: vi.fn(),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CommentForm validation accessibility', () => {
  it('surfaces required errors on submit and links them via aria-describedby', async () => {
    const user = userEvent.setup();

    render(
      <CommentForm
        onClose={() => {}}
        canMutateProject
        processStep="unsorted"
      />,
    );

    const titleInput = screen.getByLabelText('Sidebar.commentForm.titleLabel');
    // Untouched fields must stay clean, also after merely leaving one.
    await user.click(titleInput);
    await user.tab();
    expect(titleInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Sidebar.commentForm.save' }),
    );

    const titleError = await screen.findByText(
      'Sidebar.commentForm.validation.titleRequired',
    );
    expect(titleError).toHaveAttribute('role', 'alert');
    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    // The error id is unique per form instance and is what the input points at.
    expect(titleInput.getAttribute('aria-describedby')).toBe(titleError.id);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('does not keep a stale required error while the user fills a field it left empty', async () => {
    const user = userEvent.setup();

    render(
      <CommentForm
        onClose={() => {}}
        canMutateProject
        processStep="unsorted"
      />,
    );

    const titleInput = screen.getByLabelText('Sidebar.commentForm.titleLabel');
    await user.click(titleInput);
    await user.tab();
    await user.type(titleInput, 'My title');

    // A lingering message would vanish on the save mousedown, shift the
    // button and swallow the first click.
    expect(
      screen.queryByText('Sidebar.commentForm.validation.titleRequired'),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText('Sidebar.commentForm.contentLabel'),
      'My content',
    );
    await user.click(
      screen.getByRole('button', { name: 'Sidebar.commentForm.save' }),
    );

    await waitFor(() => {
      expect(addComment).toHaveBeenCalledTimes(1);
    });
  });

  it('namespaces field ids per form instance to avoid collisions', () => {
    const { container } = render(
      <div>
        <CommentForm
          onClose={() => {}}
          canMutateProject
          processStep="unsorted"
        />
        <CommentForm
          onClose={() => {}}
          canMutateProject
          processStep="unsorted"
        />
      </div>,
    );

    const titleInputs = screen.getAllByLabelText(
      'Sidebar.commentForm.titleLabel',
    );
    expect(titleInputs).toHaveLength(2);
    expect(titleInputs.at(0)?.id).not.toBe(titleInputs.at(1)?.id);

    // Each rendered id must be unique across both forms (no duplicates in the DOM).
    const ids = Array.from(container.querySelectorAll('[id]')).map(
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the form open and shows an error toast when saving fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(addComment).mockRejectedValueOnce(new Error('network down'));

    render(
      <CommentForm onClose={onClose} canMutateProject processStep="unsorted" />,
    );

    await user.type(
      screen.getByLabelText('Sidebar.commentForm.titleLabel'),
      'My title',
    );
    await user.type(
      screen.getByLabelText('Sidebar.commentForm.contentLabel'),
      'My content',
    );
    await user.click(
      screen.getByRole('button', { name: 'Sidebar.commentForm.save' }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sidebar.commentForm.saveError');
    });
    // The form must stay open so the user can retry without losing input.
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CommentForm saving state', () => {
  it('marks the save button busy until saving finishes', async () => {
    const user = userEvent.setup();
    let finishSave = () => {};
    vi.mocked(addComment).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );

    render(
      <CommentForm
        onClose={() => {}}
        canMutateProject
        processStep="unsorted"
      />,
    );
    await user.type(
      screen.getByLabelText('Sidebar.commentForm.titleLabel'),
      'My title',
    );
    await user.type(
      screen.getByLabelText('Sidebar.commentForm.contentLabel'),
      'My content',
    );
    const saveButton = screen.getByRole('button', {
      name: 'Sidebar.commentForm.save',
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

describe('CommentForm prefilled title', () => {
  it('saves a prefilled title from a long source name within the title limit', async () => {
    const user = userEvent.setup();
    vi.mocked(addComment).mockResolvedValueOnce(undefined);
    const longSourceName = 'Grunderwerbsplan Blatt '.repeat(50);

    render(
      <CommentForm
        onClose={() => {}}
        canMutateProject
        processStep="unsorted"
        initialTitle={longSourceName}
      />,
    );
    await user.type(
      screen.getByLabelText('Sidebar.commentForm.contentLabel'),
      'My content',
    );
    await user.click(
      screen.getByRole('button', { name: 'Sidebar.commentForm.save' }),
    );

    await waitFor(() => {
      expect(addComment).toHaveBeenCalledTimes(1);
    });
    const savedTitle = vi.mocked(addComment).mock.calls[0]?.[1];
    expect(savedTitle?.length).toBe(255);
    expect(savedTitle?.endsWith('…')).toBe(true);
  });
});
