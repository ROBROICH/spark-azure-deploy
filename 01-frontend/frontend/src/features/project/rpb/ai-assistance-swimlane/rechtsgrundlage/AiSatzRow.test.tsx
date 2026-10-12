import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSatzRow } from './AiSatzRow';

const mocks = vi.hoisted(() => ({
  jumpToConnectedFilePageMock: vi.fn(),
  navigateMock: vi.fn(),
  openConnectedFileMock: vi.fn(),
  toggleSatzCheckedMock: vi.fn(),
}));

type RouteSearch = {
  rechtsmethodikSatzId?: string;
  rpbLeftPanelTab?: 'gliederung' | 'beschluss';
  satzId?: string;
  topicId?: string;
  topicNormId?: string;
};

let routeSearch: RouteSearch;
let hasBewertung = true;
let satzMarkers = ['3', 'ii'];
let satzNr = '2';

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => routeSearch,
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useNavigate: () => mocks.navigateMock,
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
        'aiAssistance.satzTitle': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')}`,
        'aiAssistance.satzTitleWithMarker': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')} ${String(options?.marker ?? '')}`,
        'aiAssistance.satzTitleWithoutSatz': `Absatz ${String(options?.absatz ?? '')}`,
        'aiAssistance.satzTitleWithoutSatzWithMarker': `Absatz ${String(options?.absatz ?? '')} ${String(options?.marker ?? '')}`,
        'aiAssistance.satzMarkerNumber': `Nr. ${String(options?.marker ?? '')}`,
        'aiAssistance.satzMarkerLetter': `${String(options?.marker ?? '')})`,
        'aiAssistance.satzMarkerDoubleLetter': `${String(options?.marker ?? '')})`,
        'aiAssistance.moreOptions': 'Mehr Optionen',
        'aiAssistance.requestMore': 'Nachfordern',
        'aiAssistance.addComment': 'Kommentar hinzufügen',
        'aiAssistance.assessment': 'Bewertung',
        'aiAssistance.references': 'Fundstellen',
        'aiAssistance.showAssessment': 'Prüfergebnis anzeigen',
        'aiAssistance.openRechtsmethodik': 'Rechtsmethodik öffnen',
        'aiAssistance.assessmentResult.nicht_erfuellt': 'Nicht erfüllt',
        'aiAssistance.referencePages': `S. ${String(options?.pages ?? '')}`,
        'aiAssistance.referencePagesUnknown': 'S. --',
        'aiAssistance.noRelevantReferencesFound':
          'Keine relevanten Fundstellen für diesen Satz gefunden.',
        'aiAssistance.noAiAssessmentNeededTooltip':
          'KI-Bewertung nur für materiell-rechtliche Tatbestandsmerkmale und Rechtsfolgen',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/features/project/pdf-popout/PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    openConnectedFile: mocks.openConnectedFileMock,
    jumpToConnectedFilePage: mocks.jumpToConnectedFilePageMock,
  }),
}));

vi.mock('@/features/feedback/NodeFeedbackThumbButtons', () => ({
  NodeFeedbackThumbButtons: () => null,
}));

vi.mock('@/features/feedback/useFeedbackLookup', () => ({
  useFeedbackLookup: () => ({
    getFeedbackForTarget: () => ({ feedback: null, feedbackRef: null }),
  }),
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => () => true,
  }),
);

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType === 'norm') {
      return [{ id: 'norm-1', nodeType: 'norm' }];
    }

    if (nodeType === 'bewertung') {
      return hasBewertung ? [{ id: 'bewertung-1', nodeType: 'bewertung' }] : [];
    }

    return [];
  },
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (nodeType: string) => {
    if (nodeType === 'bewertung_quelle') {
      return {
        data: [
          {
            id: 'quelle-1',
            nodeType: 'bewertung_quelle',
            dokumentId: 'dokument-1',
            title: 'Beispieldokument A',
            chunkIds: ['chunk-1'],
            pageNumbers: [5, 7],
          },
          {
            id: 'quelle-2',
            nodeType: 'bewertung_quelle',
            dokumentId: 'dokument-1',
            title: 'Bearbeiter:',
            chunkIds: ['chunk-2'],
            pageNumbers: [11],
          },
        ],
      };
    }

    return {
      data: [],
    };
  },
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; nodeType: string } | undefined) => {
    if (!nodeRef) {
      return {
        data: null,
      };
    }

    if (nodeRef.nodeType === 'absatz') {
      return {
        data: {
          id: nodeRef.id,
          nodeType: 'absatz',
          absatzNr: '1',
        },
      };
    }

    if (nodeRef.nodeType === 'satz') {
      return {
        data: {
          id: nodeRef.id,
          nodeType: 'satz',
          satzNr: satzNr,
          position: 99,
          markers: satzMarkers,
          text: 'Der Satztext',
        },
      };
    }

    if (nodeRef.nodeType === 'bewertung') {
      return {
        data: {
          id: nodeRef.id,
          nodeType: 'bewertung',
          kurzform: 'nichterfuellt [42]',
          result: 'nicht_erfuellt',
        },
      };
    }

    return {
      data: null,
    };
  },
  useNodes: () => ({
    data: [
      {
        id: 'dokument-1',
        nodeType: 'dokument',
        filename: 'Beispieldokument A.pdf',
        dmsFileId: 'project-file-1',
      },
    ],
  }),
}));

vi.mock('./AiTopicNormContext', () => ({
  useKiTopicNormState: () => ({
    canMutateTopic: true,
    getSatzReviewStatus: () => 'unchecked',
    isSatzChecked: () => false,
    topicNorm: {
      satzStatuses: {},
      topicId: 'topic-1',
    },
    toggleSatzChecked: mocks.toggleSatzCheckedMock,
  }),
}));

vi.mock('@/features/ui/accordion/Accordion', () => ({
  AccordionItem: (props: ComponentProps<'div'>) => {
    return <div>{props.children}</div>;
  },
  AccordionTrigger: (props: ComponentProps<'button'>) => {
    const { children, className, type, ...rest } = props;

    return (
      <button type={type ?? 'button'} className={className} {...rest}>
        {children}
      </button>
    );
  },
  AccordionContent: (props: ComponentProps<'div'>) => {
    return <div>{props.children}</div>;
  },
}));

vi.mock('@/features/ui/action-menu/ActionMenu', () => ({
  ActionMenu: (props: ComponentProps<'div'>) => <div>{props.children}</div>,
  ActionMenuTrigger: (
    props: ComponentProps<'div'> & {
      asChild?: boolean;
    },
  ) => {
    const { asChild: _asChild, children, ...divProps } = props;

    return <div {...divProps}>{children}</div>;
  },
  ActionMenuContent: (props: ComponentProps<'div'>) => (
    <div>{props.children}</div>
  ),
  ActionMenuItem: (props: ComponentProps<'button'> & { variant?: string }) => {
    const { children, variant: _variant, ...buttonProps } = props;

    return (
      <button type="button" {...buttonProps}>
        {children}
      </button>
    );
  },
}));

vi.mock('@/features/ui/button/Button', () => ({
  Button: (props: ComponentProps<'button'>) => {
    return (
      <button type="button" aria-label={props['aria-label']}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('@/features/ui/button/SplitButton', () => ({
  SplitButton: () => <button type="button">split-button</button>,
}));

vi.mock('@/features/ui/tooltip/TooltipWrapper', () => ({
  TooltipWrapper: (props: { children: ReactNode; content?: string }) => (
    <div data-tooltip-content={props.content}>{props.children}</div>
  ),
}));

describe('AiSatzRow', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    routeSearch = {
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
    };
    hasBewertung = true;
    satzMarkers = ['3', 'ii'];
    satzNr = '2';
    mocks.jumpToConnectedFilePageMock.mockReset();
    mocks.navigateMock.mockReset();
    mocks.openConnectedFileMock.mockReset();
    mocks.toggleSatzCheckedMock.mockReset();
  });

  it('renders real references and wires kurzform reference clicks', async () => {
    const user = userEvent.setup();

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
        showMissingAssessmentTooltip={true}
      />,
    );

    expect(screen.getByText('nichterfuellt')).toBeInTheDocument();
    expect(screen.getByText('Nicht erfüllt')).toBeInTheDocument();
    expect(screen.queryByText('[0001]')).not.toBeInTheDocument();
    expect(screen.queryByText('[0002]')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /\[42\] Beispieldokument A/,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText('Beispieldokument A.pdf')).toBeInTheDocument();
    expect(screen.getByText('Beispieldokument A')).toBeInTheDocument();
    expect(screen.getByText('Bearbeiter:')).toBeInTheDocument();
    expect(screen.getByText('S. 5, 7')).toBeInTheDocument();
    expect(screen.getByText('S. 11')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: /\[42\] Beispieldokument A/,
      }),
    );

    expect(mocks.navigateMock).toHaveBeenCalled();
    expect(mocks.openConnectedFileMock).toHaveBeenCalledWith('project-file-1');
    expect(mocks.jumpToConnectedFilePageMock).toHaveBeenCalledWith(
      5,
      'project-file-1',
    );
  });

  it('mutes the row affordance when no bewertung exists', () => {
    hasBewertung = false;

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
        showMissingAssessmentTooltip={true}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /Absatz 1 Satz 2 Nr\. 3 ii\)/,
    });
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveClass('cursor-default');
    expect(trigger.parentElement).toHaveAttribute(
      'data-tooltip-content',
      'KI-Bewertung nur für materiell-rechtliche Tatbestandsmerkmale und Rechtsfolgen',
    );

    const chevron = trigger.querySelector('span');
    expect(chevron).toHaveClass('text-slate-300');
  });

  it('links the rechtsmethodik button to the rechtsmethodik search state on the rpb route', () => {
    routeSearch = {
      ...routeSearch,
      rpbLeftPanelTab: 'beschluss',
    };

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    const rechtsmethodikLinks = screen.getAllByRole('link', {
      name: 'Rechtsmethodik öffnen',
    });

    expect(rechtsmethodikLinks[0]).toHaveAttribute(
      'data-to',
      '/verfahren/$verfahrenId/rpb',
    );
    expect(rechtsmethodikLinks[0]).not.toHaveAttribute('aria-disabled');
    const rechtsmethodikLink = rechtsmethodikLinks.at(0);
    expect(rechtsmethodikLink).toBeDefined();
    expect(rechtsmethodikLink).not.toHaveAttribute('tabIndex', '-1');
    expect(rechtsmethodikLink).not.toHaveClass('cursor-default');
    expect(rechtsmethodikLink).not.toHaveClass('cursor-not-allowed');
    expect(
      JSON.parse(rechtsmethodikLink?.getAttribute('data-search') ?? '{}'),
    ).toEqual({
      rpbLeftPanelTab: 'beschluss',
      topicId: routeSearch.topicId,
      topicNormId: routeSearch.topicNormId,
      rechtsmethodikSatzId: 'satz-1',
    });
  });

  it('links the assessment button to the bewertung search state on the rpb route', () => {
    routeSearch = {
      ...routeSearch,
      rpbLeftPanelTab: 'beschluss',
    };

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    const assessmentLink = screen.getByRole('link', {
      name: 'Prüfergebnis anzeigen',
    });

    expect(assessmentLink).toHaveAttribute(
      'data-to',
      '/verfahren/$verfahrenId/rpb',
    );
    expect(
      JSON.parse(assessmentLink.getAttribute('data-search') ?? '{}'),
    ).toEqual({
      rpbLeftPanelTab: 'beschluss',
      topicId: routeSearch.topicId,
      topicNormId: routeSearch.topicNormId,
      satzId: 'satz-1',
    });
  });

  it('opens the legal-review request form for the sentence', async () => {
    const user = userEvent.setup();

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Nachfordern' }));

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search(routeSearch);

    expect(nextSearch).toEqual({
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
      sidebarPanel: 'requestList',
      newRequestListInitItems: [
        {
          title: 'Absatz 1 Satz 2 Nr. 3 ii)',
          topicId: 'topic-1',
          sourceRef: {
            type: 'materialSatz',
            itemId: 'satz-1',
          },
        },
      ],
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('opens the legal-review comment form for the sentence', async () => {
    const user = userEvent.setup();

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Kommentar hinzufügen' }),
    );

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search(routeSearch);

    expect(nextSearch).toEqual({
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
      sidebarPanel: 'comments',
      newCommentInitItems: [
        {
          title: 'Absatz 1 Satz 2 Nr. 3 ii)',
          processStep: 'legalReview',
          sourceRef: {
            type: 'materialSatz',
            itemId: 'satz-1',
          },
        },
      ],
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('uses the norm and law context for sentence request titles', async () => {
    const user = userEvent.setup();

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={true}
        requestTitlePrefix="§ 15"
        requestTitleSuffix="BNatSchG"
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Nachfordern' }));

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search(routeSearch);

    expect(nextSearch.newRequestListInitItems[0].title).toBe(
      '§ 15 Absatz 1 Satz 2 Nr. 3 ii) BNatSchG',
    );
  });

  it('falls back to the norm context in the visible row title when the sentence title is empty', () => {
    satzMarkers = [];
    satzNr = '1';

    render(
      <AiSatzRow
        absatzRef={{ id: 'absatz-1', nodeType: 'absatz' }}
        hasMultipleAbsaetze={false}
        hasMultipleSaetze={false}
        requestTitlePrefix="§ 31"
        requestTitleSuffix="BNatSchG"
        satzRef={{ id: 'satz-1', nodeType: 'satz' }}
        showDivider={false}
      />,
    );

    expect(
      screen.getByRole('button', { name: /§ 31 BNatSchG/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('§ 31 BNatSchG')).toBeInTheDocument();
  });
});
