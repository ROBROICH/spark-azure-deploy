import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopicBadgeSelect } from './TopicBadgeSelect';

const mocks = vi.hoisted(() => ({
  commitTopicIds: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock(
  '@/features/project/fvp/main-screen/documents-card/documents-table/FvpTopicAssignmentContext',
  () => ({
    useFvpTopicAssignment: () => ({
      commitTopicIds: mocks.commitTopicIds,
      hasLinkedDocument: true,
      selectedTopicIds: [],
      topicOptions: [{ id: 'topic-1', label: 'Topic one' }],
    }),
  }),
);

afterEach(() => {
  cleanup();
  mocks.commitTopicIds.mockClear();
});

describe('TopicBadgeSelect', () => {
  it('keeps the topic dropdown closed when project edits are read-only', async () => {
    const user = userEvent.setup();

    render(<TopicBadgeSelect dmsFileId="file-1" disabled />);

    const trigger = screen.getByRole('button', {
      name: 'DocumentsCard.table.topic.ariaLabel',
    });

    expect(trigger.hasAttribute('disabled')).toBe(true);

    await user.click(trigger);

    expect(screen.queryByText('Topic one')).toBeNull();
  });
});
