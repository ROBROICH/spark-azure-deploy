import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeleteDialog } from './DeleteDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
    useSearch: () => ({ deleteCommentId: 'comment-1' }),
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/features/project/comments/data/read-model/useComments', () => ({
  useComments: () => ({
    comments: [
      {
        id: 'comment-1',
        projectId: 'project-1',
        title: 'Comment to delete',
        content: 'Body',
        createdAt: new Date(),
        updatedAt: new Date(),
        processStep: 'unsorted',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/features/project/comments/data/actions/commentActions', () => ({
  removeComment: vi.fn(),
}));

afterEach(() => cleanup());

describe('Comments DeleteDialog accessibility', () => {
  it('wires the dialog description to the body copy via aria-describedby', () => {
    render(<DeleteDialog canMutateProject />);

    const dialog = screen.getByRole('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // The id must point at the rendered description paragraph so screen readers
    // announce the destructive-action body copy.
    const description = document.getElementById(describedBy ?? '');
    expect(description).toHaveTextContent(
      'Sidebar.commentDeleteDialog.description',
    );
  });
});
