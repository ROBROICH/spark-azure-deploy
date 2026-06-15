import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MvpFeedbackDialogMount } from './MvpFeedbackDialogMount';

type RouteSearch = {
  feedbackRating?: 'positive' | 'negative';
  feedbackTargetId?: string;
  feedbackTargetType?: 'fundstelle' | 'chunk' | 'dokument' | 'norm';
  selectedNormId?: string;
};

const { dialogPropsMock, navigateMock, routeState } = vi.hoisted(() => ({
  dialogPropsMock: vi.fn(),
  navigateMock: vi.fn(),
  routeState: {
    search: {} satisfies RouteSearch,
  },
}));

vi.mock('@/features/feedback/FeedbackNodeDialog', () => ({
  FeedbackNodeDialog: (props: Record<string, unknown>) => {
    dialogPropsMock(props);

    return <div data-testid="feedback-dialog" />;
  },
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({
    getNodesByType: (nodeType: string) =>
      nodeType === 'fundstelle'
        ? [{ id: 'fundstelle-1', node_type: 'fundstelle' }]
        : [],
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
    useSearch: ({ select }: { select: (search: RouteSearch) => unknown }) =>
      select(routeState.search),
  }),
}));

describe('MvpFeedbackDialogMount', () => {
  beforeEach(() => {
    dialogPropsMock.mockReset();
    navigateMock.mockReset();
    routeState.search = {};
  });

  afterEach(cleanup);

  it('maps valid feedback search params to the feedback dialog', () => {
    routeState.search = {
      feedbackRating: 'positive',
      feedbackTargetId: 'fundstelle-1',
      feedbackTargetType: 'fundstelle',
    };

    render(<MvpFeedbackDialogMount />);

    expect(dialogPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialRating: 'positive',
        namespace: 'MvpRedesign',
        targetRef: { id: 'fundstelle-1', node_type: 'fundstelle' },
      }),
    );
  });

  it('omits the target when route data is incomplete', () => {
    routeState.search = {
      feedbackRating: 'negative',
      feedbackTargetId: 'fundstelle-1',
    };

    render(<MvpFeedbackDialogMount />);

    expect(dialogPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialRating: undefined,
        targetRef: undefined,
      }),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
  });

  it('clears stale feedback target params instead of passing them to the dialog', () => {
    routeState.search = {
      feedbackRating: 'negative',
      feedbackTargetId: 'missing-fundstelle',
      feedbackTargetType: 'fundstelle',
    };

    render(<MvpFeedbackDialogMount />);

    expect(dialogPropsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialRating: undefined,
        targetRef: undefined,
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({
        feedbackRating: 'negative',
        feedbackTargetId: 'missing-fundstelle',
        feedbackTargetType: 'fundstelle',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      feedbackRating: 'negative',
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
      selectedNormId: 'norm-1',
    });
  });

  it('clears feedback route params on close while preserving unrelated search keys', () => {
    routeState.search = {
      feedbackRating: 'positive',
      feedbackTargetId: 'fundstelle-1',
      feedbackTargetType: 'fundstelle',
    };

    render(<MvpFeedbackDialogMount />);

    const onClose = dialogPropsMock.mock.calls[0]?.[0].onClose;
    onClose();

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({
        feedbackRating: 'positive',
        feedbackTargetId: 'fundstelle-1',
        feedbackTargetType: 'fundstelle',
        selectedNormId: 'norm-1',
      }),
    ).toEqual({
      feedbackRating: undefined,
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
      selectedNormId: 'norm-1',
    });
  });
});
