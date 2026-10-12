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

vi.mock('@/features/project/comments/data/actions/commentActions', () => ({
  removeComment: vi.fn(),
}));

afterEach(() => cleanup());

describe('Comments DeleteDialog accessibility', () => {
  it('wires the dialog description to the body copy via aria-describedby', () => {
    render(<DeleteDialog canMutateProject items={[]} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Sidebar.commentDeleteDialog.description',
    );
  });
});
