import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTopicNormRow } from './AiTopicNormRow';

type RouteSearch = {
  previewDocumentId?: string;
  rechtsmethodikSatzId?: string;
  rpbLeftPanelTab?: 'gliederung' | 'beschluss';
  satzId?: string;
  topicId?: string;
  topicNormId?: string;
};

let routeSearch: RouteSearch;

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

const testState = vi.hoisted(() => ({
  topicNormType: 'pruefung' as 'pruefung' | 'verfahren',
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
  }),
  Link: (
    props: ComponentProps<'a'> & {
      params?: unknown;
      resetScroll?: boolean;
      search?: Record<string, unknown> | ((prev: RouteSearch) => RouteSearch);
      to?: string;
    },
  ) => {
    const {
      children,
      params: _params,
      resetScroll: _resetScroll,
      search,
      to,
      ...anchorProps
    } = props;
    const resolvedSearch =
      typeof search === 'function' ? search(routeSearch) : search;

    return (
      <a
        data-search={JSON.stringify(resolvedSearch ?? null)}
        data-to={to}
        href={to ?? '#'}
        {...anchorProps}
      >
        {children}
      </a>
    );
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'aiAssistance.normHasAiRating': 'AI rating exists',
        'aiAssistance.normHasAiRatingTooltip':
          'This norm has an AI assessment.',
        'aiAssistance.satzeChecked': `${String(options?.checked ?? '')}/${String(options?.total ?? '')}`,
        'aiAssistance.satzeCheckedShort': `${String(options?.checked ?? '')}/${String(options?.total ?? '')}`,
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType === 'norm') {
      return [{ id: 'norm-1', node_type: 'norm' }];
    }

    if (nodeType === 'satz') {
      return [
        { id: 'satz-1', node_type: 'satz' },
        { id: 'satz-2', node_type: 'satz' },
      ];
    }

    if (nodeType === 'bewertung') {
      return [{ id: 'bewertung-1', node_type: 'bewertung' }];
    }

    return [];
  },
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; node_type: string } | undefined) => {
    if (nodeRef?.node_type === 'topic_norm') {
      return {
        data: {
          id: nodeRef.id,
          jurabk: 'BNatSchG',
          paragraph_nr: '44',
          satz_statuses: {
            'satz-1': 'checked',
          },
          type: testState.topicNormType,
        },
      };
    }

    if (nodeRef?.node_type === 'norm') {
      return {
        data: {
          paragraph_titel: 'Test norm',
        },
      };
    }

    return { data: null };
  },
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: (nodeRef: { id: string; node_type: string } | undefined) => {
    if (nodeRef?.node_type === 'norm') {
      return {
        data: {
          paragraph_titel: 'Test norm',
        },
      };
    }

    return { data: null };
  },
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', () => ({
  LawChangeIndicator: () => null,
}));

vi.mock('@/features/ui/ai/AiSparklesChip', () => ({
  AiSparklesChip: (props: ComponentProps<'span'>) => <span {...props} />,
}));

vi.mock('@/features/ui/tooltip/TooltipWrapper', () => ({
  TooltipWrapper: (props: { children: ReactNode }) => <>{props.children}</>,
}));

vi.mock('../shared/ItemRow', () => ({
  RpbOverviewItemRow: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

vi.mock('../shared/StatusBadge', () => ({
  StatusBadge: (props: { badge: { label: string } }) => (
    <span>{props.badge.label}</span>
  ),
}));

describe('AiTopicNormRow', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    routeSearch = {
      previewDocumentId: 'document-1',
      rpbLeftPanelTab: 'beschluss',
      satzId: 'satz-1',
      topicId: 'topic-1',
      topicNormId: 'old-topic-norm',
    };
    testState.topicNormType = 'pruefung';
    mocks.navigateMock.mockReset();
  });

  it('preserves the selected left swimlane tab when opening a norm detail', () => {
    render(
      <AiTopicNormRow
        topicNormRef={{ id: 'topic-norm-1', node_type: 'topic_norm' }}
      />,
    );

    const link = screen.getByRole('link', { name: '§ 44 Test norm' });
    const search = JSON.parse(link.getAttribute('data-search') ?? '{}');

    expect(search).toEqual({
      previewDocumentId: 'document-1',
      rpbLeftPanelTab: 'beschluss',
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
    });
  });

  it('hides the norm type badge on norm rows', () => {
    testState.topicNormType = 'verfahren';

    render(
      <AiTopicNormRow
        topicNormRef={{ id: 'topic-norm-1', node_type: 'topic_norm' }}
      />,
    );

    expect(screen.queryByText('Verfahrensrechtlich')).toBeNull();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});
