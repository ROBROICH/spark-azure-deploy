import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeFeedbackThumbButtons } from './NodeFeedbackThumbButtons';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useFeedbackForTargetMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigateMock,
}));

vi.mock('./FeedbackLookupProvider', () => ({
  useFeedbackForTarget: mocks.useFeedbackForTargetMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'NodeFeedbackThumbButtons.thumbsDownAriaLabel': 'Negativ',
        'NodeFeedbackThumbButtons.thumbsUpAriaLabel': 'Positiv',
      };

      return translations[key] ?? key;
    },
  }),
}));

const targetRef = { id: 'target-1', node_type: 'fundstelle' as const };
const existingFeedback = {
  id: 'feedback-1',
  node_type: 'feedback' as const,
  compositeKey: 'feedback:feedback-1',
  project_id: 'project-1',
  is_deleted: false,
  rating: 'positive' as const,
  reason: 'RESULT_CORRECT',
  text: 'old text',
  user_id: 'other-user',
  frontend_parent_ids: ['fundstelle:target-1'],
  update_type: 'manual' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  sys_period: null,
};

describe('NodeFeedbackThumbButtons', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.navigateMock.mockReset();
    mocks.useFeedbackForTargetMock.mockReturnValue({
      feedback: null,
      feedbackRef: null,
    });
  });

  it('opens a new feedback dialog for the target node', async () => {
    const user = userEvent.setup();

    render(<NodeFeedbackThumbButtons targetRef={targetRef} />);

    await user.click(screen.getByRole('button', { name: 'Positiv' }));

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    const searchUpdater = mocks.navigateMock.mock.calls[0]?.[0].search as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(searchUpdater({ existing: 'value' })).toEqual({
      existing: 'value',
      feedbackRating: 'positive',
      feedbackTargetId: 'target-1',
      feedbackTargetType: 'fundstelle',
    });
  });

  it('opens existing feedback when clicking either thumb', async () => {
    const user = userEvent.setup();
    mocks.useFeedbackForTargetMock.mockReturnValue({
      feedback: existingFeedback,
      feedbackRef: { id: 'feedback-1', node_type: 'feedback' },
    });

    render(<NodeFeedbackThumbButtons targetRef={targetRef} />);

    await user.click(screen.getByRole('button', { name: 'Positiv' }));
    await user.click(screen.getByRole('button', { name: 'Negativ' }));

    expect(mocks.navigateMock).toHaveBeenCalledTimes(2);
    const searchUpdater = mocks.navigateMock.mock.calls[0]?.[0].search as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(searchUpdater({ existing: 'value' })).toEqual({
      existing: 'value',
      feedbackRating: undefined,
      feedbackTargetId: 'target-1',
      feedbackTargetType: 'fundstelle',
    });
    const secondSearchUpdater = mocks.navigateMock.mock.calls[1]?.[0]
      .search as (prev: Record<string, unknown>) => Record<string, unknown>;
    expect(secondSearchUpdater({ existing: 'value' })).toEqual({
      existing: 'value',
      feedbackRating: undefined,
      feedbackTargetId: 'target-1',
      feedbackTargetType: 'fundstelle',
    });
  });
});
