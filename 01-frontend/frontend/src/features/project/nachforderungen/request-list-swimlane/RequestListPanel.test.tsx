import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestListPanel } from './RequestListPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
    useSearch: () => ({ search: '' }),
  }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-db', () => ({
  eq: vi.fn(),
  useLiveInfiniteQuery: () => ({
    data: [],
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock(
  '@/features/project/nachforderungen/data/collections/requestItems.collection',
  () => ({
    REQUEST_ITEMS_PAGE_SIZE: 50,
    createRequestItemsCollection: () => ({}),
  }),
);

vi.mock('../data/actions/requestItemActions', () => ({
  toggleIncludedInLetter: vi.fn(),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({ canMutateProject: true }),
  }),
);

vi.mock(
  '@/features/project/nachforderungen/sidebar-panel/DeleteDialog',
  () => ({
    DeleteDialog: () => null,
  }),
);

vi.mock(
  '@/features/project/nachforderungen/sidebar-panel/RequestListItemCard',
  () => ({
    RequestListItemCard: () => null,
  }),
);

// A minimal stand-in for the real form: it exposes a labelled first field and a
// cancel button wired to onClose so the panel's focus handoff can be exercised.
vi.mock('@/features/project/nachforderungen/sidebar-panel/RequestForm', () => ({
  RequestForm: (props: { onClose: () => void }) => (
    <div>
      <input aria-label="title field" />
      <button type="button" onClick={props.onClose}>
        cancel
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe('RequestListPanel manual form focus handoff', () => {
  it('moves focus into the form when it opens and restores it to the add button on close', async () => {
    const user = userEvent.setup();
    render(<RequestListPanel />);

    const addButton = screen.getByRole('button', {
      name: 'RequestListPanel.addDocument',
    });

    await user.click(addButton);

    // Opening the form moves focus to its first field instead of stranding the
    // user on the removed add button.
    const firstField = screen.getByLabelText('title field');
    expect(firstField).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'cancel' }));

    // Closing returns focus to the now-restored add button.
    const restoredAddButton = screen.getByRole('button', {
      name: 'RequestListPanel.addDocument',
    });
    expect(restoredAddButton).toHaveFocus();
  });
});
