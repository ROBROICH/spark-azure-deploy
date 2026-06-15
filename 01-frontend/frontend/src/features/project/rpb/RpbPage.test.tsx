import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpbPage } from './RpbPage';

const mocks = vi.hoisted(() => ({
  aiPanelMountedMock: vi.fn(),
}));

let routeSearch: {
  previewDocumentId?: string;
  rechtsmethodikSatzId?: string;
  satzId?: string;
  topicId?: string;
  topicNormId?: string;
};

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: () => routeSearch,
    useNavigate: () => vi.fn(),
  }),
  Link: (props: { children: ReactNode }) => <a>{props.children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({ isPoppedOut: false }),
}));

vi.mock('@/features/ui/swimlanes/useSwimlanesGroupSearchState', () => ({
  useSwimlanesGroupSearchState: () => ({}),
}));

vi.mock('@/features/ui/swimlanes/Swimlanes', () => {
  const SwimlanesRoot = (props: ComponentProps<'div'>) => {
    return <div>{props.children}</div>;
  };

  SwimlanesRoot.Group = (props: ComponentProps<'div'>) => {
    return <div>{props.children}</div>;
  };

  SwimlanesRoot.Lane = (props: ComponentProps<'section'>) => {
    return <section>{props.children}</section>;
  };

  return {
    Swimlanes: SwimlanesRoot,
  };
});

vi.mock('@/features/project/pdf-popout/PdfPopoutSwimlane', () => ({
  PdfPopoutSwimlane: () => <div>pdf-popout-swimlane</div>,
}));

vi.mock('./beschluss-swimlane/BeschlussSwimlane', () => ({
  BeschlussSwimlane: () => <div>beschluss-panel</div>,
}));

vi.mock('./beschluss-swimlane/BeschlussSwimlaneSkeleton', () => ({
  BeschlussSwimlaneSkeleton: () => <div>beschluss-panel-skeleton</div>,
}));

vi.mock('./outline-swimlane/OutlineSwimlane', () => ({
  OutlineSwimlane: () => <div>outline-panel</div>,
}));

vi.mock('./outline-swimlane/OutlineSwimlaneSkeleton', () => ({
  OutlineSwimlaneSkeleton: () => <div>outline-panel-skeleton</div>,
}));

vi.mock('./ai-assistance-swimlane/AiAssistanceSwimlane', () => {
  return {
    AiAssistanceSwimlane: () => {
      const hasMountedRef = useRef(false);

      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        mocks.aiPanelMountedMock();
      }

      return <div>ki-panel</div>;
    },
  };
});

vi.mock('./pdf-view-swimlane/RpbPdfPopoutScopeRegistration', () => ({
  RpbPdfPopoutScopeRegistration: () => null,
}));

vi.mock('./workspace-state/RpbOutlineContext', () => ({
  RpbOutlineProvider: (props: { children: ReactNode }) => {
    return <>{props.children}</>;
  },
}));

describe('RpbPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    routeSearch = {
      previewDocumentId: 'doc-1',
      topicId: 'topic-1',
    };
    mocks.aiPanelMountedMock.mockReset();
  });

  it('keeps the KI lane mounted when unrelated search params change', () => {
    const { rerender } = render(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);

    routeSearch = {
      ...routeSearch,
      previewDocumentId: 'doc-2',
    };
    rerender(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the KI lane mounted when topic-related search params change', () => {
    const { rerender } = render(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);

    routeSearch = {
      ...routeSearch,
      topicNormId: 'topic-norm-1',
    };
    rerender(<RpbPage />);

    routeSearch = {
      ...routeSearch,
      rechtsmethodikSatzId: 'satz-1',
    };
    rerender(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the KI lane mounted when only topicId changes', () => {
    const { rerender } = render(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);

    routeSearch = {
      ...routeSearch,
      topicId: 'topic-2',
    };
    rerender(<RpbPage />);

    expect(mocks.aiPanelMountedMock).toHaveBeenCalledTimes(1);
  });
});
