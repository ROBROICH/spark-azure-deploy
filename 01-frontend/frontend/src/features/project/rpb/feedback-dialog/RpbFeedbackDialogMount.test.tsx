import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpbFeedbackDialogMount } from './RpbFeedbackDialogMount';

type RouteSearch = {
  feedbackRating?: 'positive' | 'negative';
  feedbackTargetId?: string;
  feedbackTargetType?: string;
  topicId?: string;
};

const routeState = vi.hoisted<{ search: RouteSearch }>(() => ({
  search: {
    feedbackRating: 'positive',
    feedbackTargetId: 'bewertung-1',
    feedbackTargetType: 'bewertung',
    topicId: 'topic-1',
  } satisfies RouteSearch,
}));

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  hasNodeMock: vi.fn((nodeId: string) => nodeId === 'bewertung-1'),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
    useSearch: (options?: { select?: (search: RouteSearch) => unknown }) =>
      options?.select ? options.select(routeState.search) : routeState.search,
  }),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({ hasNode: mocks.hasNodeMock }),
}));

vi.mock('@/features/feedback/FeedbackNodeDialog', () => ({
  FeedbackNodeDialog: (props: {
    initialRating?: string;
    namespace: string;
    onClose: () => void;
    targetRef?: {
      id: string;
      nodeType: string;
    };
  }) => (
    <div>
      <span data-testid="namespace">{props.namespace}</span>
      <span data-testid="initial-rating">{props.initialRating}</span>
      <span data-testid="target-ref">
        {props.targetRef
          ? `${props.targetRef.nodeType}:${props.targetRef.id}`
          : 'none'}
      </span>
      <button type="button" onClick={props.onClose}>
        close feedback
      </button>
    </div>
  ),
}));

describe('RpbFeedbackDialogMount', () => {
  beforeEach(() => {
    routeState.search = {
      feedbackRating: 'positive',
      feedbackTargetId: 'bewertung-1',
      feedbackTargetType: 'bewertung',
      topicId: 'topic-1',
    };
    mocks.navigateMock.mockReset();
    mocks.hasNodeMock.mockReset();
    mocks.hasNodeMock.mockImplementation(
      (nodeId: string) => nodeId === 'bewertung-1',
    );
  });

  afterEach(cleanup);

  it('passes a valid RPB feedback target to the dialog', () => {
    render(<RpbFeedbackDialogMount />);

    expect(screen.getByTestId('namespace')).toHaveTextContent('Rpb');
    expect(screen.getByTestId('initial-rating')).toHaveTextContent('positive');
    expect(screen.getByTestId('target-ref')).toHaveTextContent(
      'bewertung:bewertung-1',
    );
  });

  it('clears feedback route state when the dialog closes', async () => {
    const user = userEvent.setup();

    render(<RpbFeedbackDialogMount />);

    await user.click(screen.getByRole('button', { name: 'close feedback' }));

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(
      mocks.navigateMock.mock.calls[0]?.[0].search(routeState.search),
    ).toEqual({
      feedbackRating: undefined,
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
      topicId: 'topic-1',
    });
  });

  it('does not open the dialog and canonicalizes a route-invalid target type', () => {
    routeState.search = {
      feedbackRating: 'positive',
      feedbackTargetId: 'bewertung-1',
      // fundstelle is not an allowed RPB feedback target type.
      feedbackTargetType: 'fundstelle',
      topicId: 'topic-1',
    };

    render(<RpbFeedbackDialogMount />);

    expect(screen.getByTestId('target-ref')).toHaveTextContent('none');
    expect(screen.getByTestId('initial-rating')).toBeEmptyDOMElement();
    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(
      mocks.navigateMock.mock.calls[0]?.[0].search(routeState.search),
    ).toEqual({
      feedbackRating: 'positive',
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
      topicId: 'topic-1',
    });
  });

  it('does not open the dialog for a dangling target id missing from the graph', () => {
    routeState.search = {
      feedbackRating: 'positive',
      feedbackTargetId: 'missing-bewertung',
      feedbackTargetType: 'bewertung',
      topicId: 'topic-1',
    };

    render(<RpbFeedbackDialogMount />);

    expect(screen.getByTestId('target-ref')).toHaveTextContent('none');
    expect(screen.getByTestId('initial-rating')).toBeEmptyDOMElement();
    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(
      mocks.navigateMock.mock.calls[0]?.[0].search(routeState.search),
    ).toEqual({
      feedbackRating: 'positive',
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
      topicId: 'topic-1',
    });
  });
});
