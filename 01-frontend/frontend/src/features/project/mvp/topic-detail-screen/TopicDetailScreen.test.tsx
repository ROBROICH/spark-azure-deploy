import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopicDetailScreen } from './TopicDetailScreen';

type RouteSearch = {
  laneOrder?: 'documentsFirst' | 'rechtsgrundlageFirst';
  leftPanelTab?: 'dokumente' | 'rechtsgrundlage';
  previewDocumentId?: string;
  selectedDocumentId?: string;
};

const {
  groupPropsMock,
  lanePropsMock,
  localStorageState,
  navigateMock,
  routeState,
} = vi.hoisted(() => ({
  groupPropsMock: vi.fn(),
  lanePropsMock: vi.fn(),
  localStorageState: {
    value: 'documentsFirst' as 'documentsFirst' | 'rechtsgrundlageFirst',
  },
  navigateMock: vi.fn(),
  routeState: {
    search: {} satisfies RouteSearch,
  },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
    useParams: () => ({ topicName: 'topic-1', verfahrenId: 'project-1' }),
    useSearch: ({ select }: { select: (search: RouteSearch) => unknown }) =>
      select(routeState.search),
  }),
}));

vi.mock('@/features/shared/browser-storage/useLocalStorage', () => ({
  useLocalStorage: () => [
    localStorageState.value,
    (nextValue: 'documentsFirst' | 'rechtsgrundlageFirst') => {
      localStorageState.value = nextValue;
    },
  ],
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: () => ({
    data: [
      {
        id: 'document-1',
        dmsFileId: 'file-1',
        filename: 'folder/document-1.pdf',
      },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useGraphPerfDiagnostics', () => ({
  useGraphPerfReadyOnce: () => undefined,
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => () => false,
  }),
);

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({ isPoppedOut: false }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutSwimlane', () => ({
  PdfPopoutSwimlane: () => null,
}));

vi.mock('@/features/ui/button/Button', () => ({
  Button: (props: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" disabled={props.disabled} onClick={props.onClick}>
      {props.children}
    </button>
  ),
}));

vi.mock('@/features/ui/swimlanes/Swimlanes', () => {
  const Swimlanes = (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  );
  Swimlanes.Group = (props: Record<string, unknown>) => {
    groupPropsMock(props);

    return <div>{props.children as ReactNode}</div>;
  };
  Swimlanes.Lane = (props: Record<string, unknown>) => {
    lanePropsMock(props);

    return <section>{props.children as ReactNode}</section>;
  };

  return { Swimlanes };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./screen-content/BackButtonBar', () => ({
  BackButtonBar: () => null,
}));

vi.mock('./documents-swimlane/DocumentsSwimlane', () => ({
  DocumentsSwimlane: () => null,
}));

vi.mock('./fundstellen-swimlane/FundstellenSwimlane', () => ({
  FundstellenSwimlane: () => null,
}));

vi.mock('./screen-content/MvpFundstellenContext', () => ({
  MvpFundstellenProvider: (props: { children: ReactNode }) => (
    <>{props.children}</>
  ),
}));

vi.mock('./pdf-view-swimlane/MvpPdfPopoutScopeRegistration', () => ({
  MvpPdfPopoutScopeRegistration: () => null,
}));

vi.mock(
  './screen-content/rechtsgrundlage-dialog/RechtsgrundlageDialog',
  () => ({
    RechtsgrundlageDialog: (props: { open: boolean }) => (
      <div data-open={props.open} />
    ),
  }),
);

vi.mock('./rechtsgrundlage-swimlane/RechtsgrundlageSwimlane', () => ({
  RechtsgrundlageSwimlane: () => null,
}));

describe('TopicDetailScreen', () => {
  beforeEach(() => {
    groupPropsMock.mockReset();
    lanePropsMock.mockReset();
    navigateMock.mockReset();
    localStorageState.value = 'documentsFirst';
    routeState.search = {};
  });

  afterEach(cleanup);

  it('canonicalizes missing lane order into route search', () => {
    render(<TopicDetailScreen />);

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(navigateMock.mock.calls[0]?.[0].search({})).toEqual({
      laneOrder: 'documentsFirst',
      leftPanelTab: undefined,
    });
  });

  it('activates the documents lane when a document is selected', () => {
    routeState.search = {
      laneOrder: 'rechtsgrundlageFirst',
      selectedDocumentId: 'document-1',
    };

    render(<TopicDetailScreen />);

    expect(groupPropsMock.mock.calls[0]?.[0].value).toBe('dokumente');
  });

  it('disables the Rechtsgrundlage edit action without mutation rights', () => {
    routeState.search = { laneOrder: 'documentsFirst' };

    render(<TopicDetailScreen />);

    const rechtsgrundlageLane = lanePropsMock.mock.calls
      .map((call) => call[0])
      .find((props) => props.id === 'rechtsgrundlage');

    expect(rechtsgrundlageLane.action.props.disabled).toBe(true);
  });
});
