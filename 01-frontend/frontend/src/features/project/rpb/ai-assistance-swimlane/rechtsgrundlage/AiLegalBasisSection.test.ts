import { toCompositeKey } from '@/db/nodes/compositeKey';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { Accordion } from '@/features/ui/accordion/Accordion';
import type * as AccordionModule from '@/features/ui/accordion/Accordion';
import type * as ReactModule from 'react';
import {
  AiLegalBasisSection,
  sortTopicNormRefsByParagraphNumber,
} from './AiLegalBasisSection';

const testState = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routeSearch: {
    gesetzId: undefined as string | undefined,
    topicId: 'topic-1',
  },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => testState.navigateMock,
    useSearch: (options?: {
      select?: (search: typeof testState.routeSearch) => unknown;
    }) =>
      options?.select
        ? options.select(testState.routeSearch)
        : testState.routeSearch,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: () => ({
    data: [
      {
        id: 'topic-norm-1',
        jurabk: 'BNatSchG',
        paragraphNr: '44',
      },
    ],
  }),
}));

vi.mock('./AiLegalBasisLawGroup', async () => {
  const React = await vi.importActual<typeof ReactModule>('react');
  const { AccordionContent, AccordionItem, AccordionTrigger } =
    await vi.importActual<typeof AccordionModule>(
      '@/features/ui/accordion/Accordion',
    );

  return {
    AiLegalBasisLawGroup: (props: { jurabk: string }) =>
      React.createElement(
        AccordionItem,
        { value: props.jurabk },
        React.createElement(AccordionTrigger, null, props.jurabk),
        React.createElement(AccordionContent, null, 'Normen'),
      ),
  };
});

const createTopicNormRef = (id: string) => {
  return {
    id,
    nodeType: 'topic_norm',
  } satisfies NodeRefByType<'topic_norm'>;
};

const createTopicNorm = (id: string, paragraphNr: string) => {
  return {
    id,
    nodeType: 'topic_norm',
    topicId: 'topic-1',
    projectId: 'project-1',
    type: 'pruefung',
    mvpStatus: 'unchecked',
    satzStatuses: {},
    isOutdated: false,
    updateType: null,
    isDeleted: false,
    frontendParentIds: [],
    projectVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    jurabk: 'BNatSchG',
    paragraphNr: paragraphNr,
    satz: null,
    absatz: null,
    nummer: null,
    compositeKey: toCompositeKey({ id, nodeType: 'topic_norm' }),
  } satisfies NodePayloadByType<'topic_norm'>;
};

const createOpenLegalBasisSection = () => {
  return createElement(
    Accordion,
    {
      collapsible: true,
      defaultValue: 'rechtsgrundlage',
      type: 'single',
    },
    createElement(AiLegalBasisSection),
  );
};

describe('sortTopicNormRefsByParagraphNumber', () => {
  it('sorts topic norms by paragraph number ascending within a law group', () => {
    const topicNormRefs = [
      createTopicNormRef('topic-norm-45'),
      createTopicNormRef('topic-norm-12a'),
      createTopicNormRef('topic-norm-3'),
      createTopicNormRef('topic-norm-12'),
    ];
    const topicNormsById = new Map([
      ['topic-norm-45', createTopicNorm('topic-norm-45', '45')],
      ['topic-norm-12a', createTopicNorm('topic-norm-12a', '12a')],
      ['topic-norm-3', createTopicNorm('topic-norm-3', '§ 3')],
      ['topic-norm-12', createTopicNorm('topic-norm-12', '12')],
    ]);

    expect(
      sortTopicNormRefsByParagraphNumber(topicNormRefs, topicNormsById).map(
        (topicNormRef) => topicNormRef.id,
      ),
    ).toEqual([
      'topic-norm-3',
      'topic-norm-12',
      'topic-norm-12a',
      'topic-norm-45',
    ]);
  });
});

describe('AiLegalBasisSection', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    testState.routeSearch = {
      gesetzId: undefined,
      topicId: 'topic-1',
    };
    testState.navigateMock.mockReset();
    testState.navigateMock.mockImplementation(
      (options: {
        search?: (
          prev: typeof testState.routeSearch,
        ) => typeof testState.routeSearch;
      }) => {
        if (!options.search) {
          return;
        }

        testState.routeSearch = options.search(testState.routeSearch);
      },
    );
  });

  it('closes the law accordion when gesetzId is removed from route search', async () => {
    const user = userEvent.setup();
    const { rerender } = render(createOpenLegalBasisSection());
    const trigger = screen.getByRole('button', { name: 'BNatSchG' });

    await user.click(trigger);
    rerender(createOpenLegalBasisSection());

    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    rerender(createOpenLegalBasisSection());

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(testState.routeSearch.gesetzId).toBeUndefined();
  });

  it('clears stale gesetzId route search when the law group is not available', () => {
    testState.routeSearch = {
      gesetzId: 'MissingLaw',
      topicId: 'topic-1',
    };

    render(createOpenLegalBasisSection());

    expect(testState.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    expect(testState.routeSearch.gesetzId).toBeUndefined();
  });
});
