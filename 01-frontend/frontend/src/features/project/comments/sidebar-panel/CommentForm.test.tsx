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
  it('only surfaces an error for the field the user blurred and links it via aria-describedby', async () => {
    const user = userEvent.setup();

    render(
      <CommentForm
        onClose={() => {}}
        canMutateProject
        processStep="unsorted"
      />,
    );

    const titleInput = screen.getByLabelText('Sidebar.commentForm.titleLabel');
    // Untouched fields must stay clean.
    expect(titleInput).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Blur the required title field while it is empty.
    await user.click(titleInput);
    await user.tab();

    const titleError = await screen.findByRole('alert');
    expect(titleError).toHaveTextContent(
      'Sidebar.commentForm.validation.titleRequired',
    );
    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
    // The error id is unique per form instance and is what the input points at.
    expect(titleInput.getAttribute('aria-describedby')).toBe(titleError.id);

    // The untouched content field must not be flagged just because title blurred.
    const contentInput = screen.getByLabelText(
      'Sidebar.commentForm.contentLabel',
    );
    expect(contentInput).toHaveAttribute('aria-invalid', 'false');
    expect(
      screen.queryByText('Sidebar.commentForm.validation.contentRequired'),
    ).not.toBeInTheDocument();
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
