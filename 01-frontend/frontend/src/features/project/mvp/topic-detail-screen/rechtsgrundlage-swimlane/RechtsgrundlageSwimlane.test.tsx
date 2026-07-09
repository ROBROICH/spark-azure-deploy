import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RechtsgrundlageSwimlane } from './RechtsgrundlageSwimlane';

type RouteSearch = {
  detailDocumentId?: string;
  lawChangeId?: string;
  rechtsgrundlageLawGroupId?: string;
  selectedDocumentId?: string;
  selectedNormId?: string;
};

const {
  accordionPropsMock,
  lawChangeDialogControllerMock,
  navigateMock,
  normCardItemPropsMock,
  resolvedNormTextViewPropsMock,
  routeState,
  topicNorm,
  updateMock,
  useNodeMock,
} = vi.hoisted(() => ({
  accordionPropsMock: vi.fn(),
  lawChangeDialogControllerMock: vi.fn(),
  navigateMock: vi.fn(),
  normCardItemPropsMock: vi.fn(),
  resolvedNormTextViewPropsMock: vi.fn(),
  routeState: {
    search: {
      detailDocumentId: undefined as string | undefined,
      lawChangeId: undefined as string | undefined,
      rechtsgrundlageLawGroupId: undefined as string | undefined,
      selectedDocumentId: 'doc-1' as string | undefined,
    } satisfies RouteSearch,
  },
  topicNorm: {
    id: 'topic-norm-1',
    jurabk: 'BNatSchG',
    mvp_status: 'unchecked',
    paragraph_nr: '44',
  },
  updateMock: vi.fn(),
  useNodeMock: vi.fn(),
}));

vi.mock('@/features/project/law-changes/ui/LawChangeDialogController', () => ({
  LawChangeDialogController: (props: { lawChangeId?: string }) => {
    lawChangeDialogControllerMock(props);

    return <div data-testid="law-change-dialog" />;
  },
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: (fn: () => void) => fn(),
    update: updateMock,
  }),
}));

vi.mock(
  '@/features/project/law-changes/data/collections/lawChanges.collection',
  () => ({
    lawChangesCollection: {},
  }),
);

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: useNodeMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../screen-data/useRechtsgrundlageData', () => ({
  getTopicNormLabel: () => '§ 44 Artenschutz',
  isTopicNormChecked: () => false,
  useLightweightRechtsgrundlageData: () => ({
    lawGroups: [
      {
        id: 'law-group-1',
        label: 'Law group 1',
        topicNorms: [topicNorm],
      },
    ],
    topicNormById: new Map([['topic-norm-1', topicNorm]]),
  }),
}));

vi.mock('../screen-content/MvpFundstellenContext', () => ({
  useMvpFundstellenContext: () => ({
    normIdsWithFundstellen: new Set(),
  }),
}));

vi.mock('../screen-content/NormCardItem', () => ({
  NormCardItem: (props: Record<string, unknown>) => {
    normCardItemPropsMock(props);

    return null;
  },
}));

vi.mock('../screen-content/NormCardItemSkeleton', () => ({
  NormCardItemSkeleton: () => null,
}));

vi.mock('../screen-content/NormTextView', () => ({
  NormTextView: () => null,
}));

vi.mock('../screen-content/useResolvedTopicNormEntries', () => ({
  useResolvedTopicNormEntries: () => [
    {
      gesetz: null,
      norm: { id: 'norm-1' },
      topicNorm,
    },
  ],
}));

vi.mock('../screen-content/RechtsgrundlageAccordionView', () => ({
  RechtsgrundlageAccordionView: (props: Record<string, unknown>) => {
    accordionPropsMock(props);

    return <div>Accordion</div>;
  },
}));

vi.mock('../screen-content/ResolvedNormTextView', () => ({
  ResolvedNormTextView: (props: Record<string, unknown>) => {
    resolvedNormTextViewPropsMock(props);

    return <div>resolved-norm-text-view</div>;
  },
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: () => ({
    data: [],
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: (options?: {
      select?: (loaderData: { projectVersion: number }) => unknown;
    }) =>
      options?.select
        ? options.select({ projectVersion: 1 })
        : { projectVersion: 1 },
    useParams: () => ({ topicName: 'topic-1', verfahrenId: 'project-1' }),
    useSearch: (options?: { select?: (search: RouteSearch) => unknown }) =>
      options?.select ? options.select(routeState.search) : routeState.search,
    useNavigate: () => navigateMock,
  }),
}));

const renderLawGroupContent = () => {
  const renderLawGroup =
    accordionPropsMock.mock.calls[0]?.[0].renderLawGroupContent;

  render(
    renderLawGroup({
      id: 'law-group-1',
      topicNorms: [topicNorm],
    }),
  );
};

describe('RechtsgrundlageSwimlane', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = {
      detailDocumentId: undefined,
      lawChangeId: undefined,
      rechtsgrundlageLawGroupId: undefined,
      selectedDocumentId: 'doc-1',
    };
    accordionPropsMock.mockReset();
    lawChangeDialogControllerMock.mockReset();
    navigateMock.mockReset();
    normCardItemPropsMock.mockReset();
    resolvedNormTextViewPropsMock.mockReset();
    updateMock.mockReset();
    useNodeMock.mockReset();
    useNodeMock.mockReturnValue({ data: null });
  });

  it('does not resolve a document node when only the selected document label is needed', () => {
    render(
      <RechtsgrundlageSwimlane
        canMutateTopic
        selectedDocumentLabel="Dokument 1.pdf"
      />,
    );

    expect(
      useNodeMock.mock.calls.some((call) => {
        const [nodeRef] = call;

        return nodeRef?.node_type === 'dokument';
      }),
    ).toBe(false);
  });

  it('keeps the law-change dialog mounted in the norm-text detail view', () => {
    routeState.search = {
      detailDocumentId: 'topic-norm-1',
      lawChangeId: 'BNatSchG__44__2026-01-01',
      rechtsgrundlageLawGroupId: undefined,
      selectedDocumentId: 'doc-1',
    };

    render(
      <RechtsgrundlageSwimlane
        canMutateTopic
        selectedDocumentLabel="Dokument 1.pdf"
      />,
    );

    expect(lawChangeDialogControllerMock).toHaveBeenCalledWith(
      expect.objectContaining({ lawChangeId: 'BNatSchG__44__2026-01-01' }),
    );
  });

  it('writes selected norm and law group state through replacement route updates', () => {
    render(
      <RechtsgrundlageSwimlane
        canMutateTopic
        selectedDocumentLabel="Dokument 1.pdf"
      />,
    );
    renderLawGroupContent();

    normCardItemPropsMock.mock.calls[0]?.[0].onSelectNorm('norm-1');
    accordionPropsMock.mock.calls[0]?.[0].onOpenLawGroupChange('law-group-1');
    accordionPropsMock.mock.calls[0]?.[0].onOpenLawGroupChange(null);

    expect(navigateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        replace: true,
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({ selectedNormId: 'old' }),
    ).toEqual({ selectedNormId: 'norm-1' });
    expect(
      navigateMock.mock.calls[0]?.[0].search({ selectedNormId: 'norm-1' }),
    ).toEqual({ selectedNormId: undefined });
    expect(navigateMock.mock.calls[1]?.[0].search({})).toEqual({
      rechtsgrundlageLawGroupId: 'law-group-1',
    });
    expect(
      navigateMock.mock.calls[2]?.[0].search({
        rechtsgrundlageLawGroupId: 'law-group-1',
      }),
    ).toEqual({ rechtsgrundlageLawGroupId: undefined });
  });

  it('clears detail document route state from the detail view', () => {
    routeState.search = {
      detailDocumentId: 'topic-norm-1',
      lawChangeId: undefined,
      rechtsgrundlageLawGroupId: undefined,
      selectedDocumentId: 'doc-1',
    };

    render(
      <RechtsgrundlageSwimlane
        canMutateTopic
        selectedDocumentLabel="Dokument 1.pdf"
      />,
    );

    resolvedNormTextViewPropsMock.mock.calls[0]?.[0].onBack();

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        resetScroll: false,
        search: expect.any(Function),
      }),
    );
    expect(
      navigateMock.mock.calls[0]?.[0].search({
        detailDocumentId: 'topic-norm-1',
        selectedDocumentId: 'doc-1',
      }),
    ).toEqual({
      detailDocumentId: undefined,
      selectedDocumentId: 'doc-1',
    });
  });

  it('guards review updates in read-only state', () => {
    render(
      <RechtsgrundlageSwimlane
        canMutateTopic={false}
        selectedDocumentLabel="Dokument 1.pdf"
      />,
    );
    renderLawGroupContent();

    normCardItemPropsMock.mock.calls[0]?.[0].onToggleReviewed({
      id: 'topic-norm-1',
      mvp_status: 'unchecked',
    });

    expect(updateMock).not.toHaveBeenCalled();
  });
});
