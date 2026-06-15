import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSatzDetailView } from './AiSatzDetailView';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

const routeState = vi.hoisted(() => ({
  search: {} as {
    lawChangeId?: string;
    rechtsmethodikSatzId?: string;
    topicNormId?: string;
  },
}));

const nodeState = vi.hoisted(() => ({
  hasMultipleAbsaetze: true,
  hasMultipleSaetze: false,
  missingGesetz: false,
  missingNorm: false,
  missingSatz: false,
}));

const topicNormState = vi.hoisted(() => ({
  getSatzReviewStatus: vi.fn(() => 'unchecked'),
  isSatzChecked: vi.fn(() => false),
  toggleSatzChecked: vi.fn(),
  topicNorm: {
    satz_statuses: {} as Record<string, 'checked' | 'needs_revision'>,
  },
}));

vi.mock('@tanstack/react-router', async () => {
  const { MockRouterLink } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    getRouteApi: () => ({
      useNavigate: () => mocks.navigateMock,
      useParams: () => ({ verfahrenId: 'verfahren-1' }),
      useSearch: () => routeState.search,
    }),
    Link: MockRouterLink,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      switch (key) {
        case 'aiAssistance.backToNorm':
          return 'Zurueck zur Norm';
        case 'aiAssistance.rechtsmethodikTitle':
          return 'Rechtsmethodik';
        case 'aiAssistance.rechtsmethodikLoadTitle':
          return 'Rechtsmethodik';
        case 'aiAssistance.rechtsmethodikLoadErrorTitle':
          return 'Rechtsmethodik konnte nicht geladen werden';
        case 'aiAssistance.rechtsmethodikLoadErrorDescription':
          return 'Die Satz-Rechtsmethodik ist nicht verfuegbar.';
        case 'aiAssistance.typeSectionTitle':
          return 'Typ';
        case 'aiAssistance.tatbestandsmerkmaleSectionTitle':
          return 'Tatbestandsmerkmale';
        case 'aiAssistance.rechtsfolgeSectionTitle':
          return 'Rechtsfolge';
        case 'aiAssistance.bestimmteRechtsbegriffeSectionTitle':
          return 'Bestimmte Rechtsbegriffe';
        case 'aiAssistance.unbestimmteRechtsbegriffeSectionTitle':
          return 'Unbestimmte Rechtsbegriffe';
        case 'aiAssistance.verweiseSectionTitle':
          return 'Verweise';
        case 'aiAssistance.derivedInterpretationTitle':
          return 'Gesamtauslegung';
        case 'aiAssistance.checkSentence':
          return 'Satz pruefen';
        case 'aiAssistance.sentenceChecked':
          return 'Geprueft';
        case 'aiAssistance.sentenceNeedsRevision':
          return 'Erneut pruefen';
        case 'aiAssistance.logicSummaryLabel':
          return `Praedikatenlogik: ${String(options?.logic ?? '')}`;
        case 'aiAssistance.normTypeBadge.material':
          return 'Materiell-rechtlich';
        case 'aiAssistance.normTypeBadge.procedural':
          return 'Verfahrensrechtlich';
        case 'aiAssistance.definitionSourceLabel':
          return `Quelle: ${String(options?.source ?? '')}`;
        case 'aiAssistance.referenceFallbackLabel':
          return 'Verweis';
        case 'aiAssistance.satzTitle':
          return `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')}`;
        case 'aiAssistance.satzTitleWithMarker':
          return `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')} ${String(options?.marker ?? '')}`;
        case 'aiAssistance.satzTitleWithoutSatz':
          return `Absatz ${String(options?.absatz ?? '')}`;
        case 'aiAssistance.satzTitleWithoutSatzWithMarker':
          return `Absatz ${String(options?.absatz ?? '')} ${String(options?.marker ?? '')}`;
        case 'aiAssistance.satzMarkerNumber':
          return `Nr. ${String(options?.marker ?? '')}`;
        case 'aiAssistance.satzMarkerLetter':
        case 'aiAssistance.satzMarkerDoubleLetter':
          return `${String(options?.marker ?? '')})`;
        case 'aiAssistance.sectionCount':
          return `${String(options?.label ?? '')} (${String(options?.count ?? '')})`;
        default:
          return key;
      }
    },
  }),
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', async () => {
  const { createLawChangeIndicatorMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    LawChangeIndicator: createLawChangeIndicatorMock('law-change-17'),
  };
});

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; node_type: string } | null) => {
    if (nodeRef?.node_type === 'satz') {
      if (nodeState.missingSatz) {
        return { data: null };
      }

      return {
        data: {
          absatz_id: 'absatz-1',
          formel: 'TBM 1 und TBM 2',
          id: nodeRef.id,
          markers: [],
          node_type: 'satz',
          norm_typ_lvl_1: 'materiell-rechtlich',
          norm_typ_lvl_2: 'wenn-dann',
          satz_nr: '1',
          text: 'Es ist verboten, wild lebenden Tieren nachzustellen.',
          wenn_dann: null,
        },
      };
    }

    if (nodeRef?.node_type === 'absatz') {
      return {
        data: {
          absatz_nr: '1',
          id: nodeRef.id,
          node_type: 'absatz',
          norm_id: 'norm-1',
          text: 'Absatztext',
        },
      };
    }

    if (nodeRef?.node_type === 'norm') {
      if (nodeState.missingNorm) {
        return { data: null };
      }

      return {
        data: {
          gesetz_id: 'gesetz-1',
          id: nodeRef.id,
          node_type: 'norm',
          paragraph_nr: '17',
          paragraph_titel: null,
          regelungsgegenstand: null,
          text: 'Normtext',
        },
      };
    }

    if (nodeRef?.node_type === 'gesetz') {
      if (nodeState.missingGesetz) {
        return { data: null };
      }

      return {
        data: {
          id: nodeRef.id,
          jurabk: 'BNatSchG',
          name: 'Bundesnaturschutzgesetz',
          node_type: 'gesetz',
        },
      };
    }

    return { data: null };
  },
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType !== 'absatz') {
      return [];
    }

    return nodeState.hasMultipleAbsaetze
      ? [
          { id: 'absatz-1', node_type: 'absatz' },
          { id: 'absatz-2', node_type: 'absatz' },
        ]
      : [{ id: 'absatz-1', node_type: 'absatz' }];
  },
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (nodeType: string) => {
    switch (nodeType) {
      case 'satz':
        return {
          data: [
            {
              absatz_id: 'absatz-1',
              id: 'satz-1',
              markers: [],
              node_type: 'satz',
              position: 1,
              satz_nr: '1',
              text: 'Es ist verboten, wild lebenden Tieren nachzustellen.',
            },
            ...(nodeState.hasMultipleSaetze
              ? [
                  {
                    absatz_id: 'absatz-1',
                    id: 'satz-2',
                    markers: [],
                    node_type: 'satz',
                    position: 2,
                    satz_nr: '2',
                    text: 'Weitere Verbote gelten entsprechend.',
                  },
                ]
              : []),
          ],
        };
      case 'atomares_tbm':
        return {
          data: [
            {
              id: 'tbm-1',
              node_type: 'atomares_tbm',
              prueffrage: 'Pruefe, ob wild lebenden Tieren nachgestellt wird!',
              pruefgegenstand: null,
              satz_id: 'satz-1',
              text: 'TBM 1',
            },
            {
              id: 'tbm-2',
              node_type: 'atomares_tbm',
              prueffrage: 'Pruefe, ob Tiere gefangen oder verletzt werden!',
              pruefgegenstand: null,
              satz_id: 'satz-1',
              text: 'TBM 2',
            },
          ],
        };
      case 'rechtsfolge':
        return {
          data: [
            {
              id: 'rechtsfolge-1',
              node_type: 'rechtsfolge',
              satz_id: 'satz-1',
              text: 'Es ist verboten',
            },
          ],
        };
      case 'adressat':
        return {
          data: [
            {
              entscheidung: 'Gebundene Entscheidung',
              id: 'adressat-1',
              node_type: 'adressat',
              rechtsfolge_id: 'rechtsfolge-1',
            },
          ],
        };
      case 'sollensanordnungen':
        return {
          data: [
            {
              id: 'soll-1',
              kategorie: 'Sollensanordnung',
              node_type: 'sollensanordnungen',
              rechtsfolge_id: 'rechtsfolge-1',
            },
          ],
        };
      case 'bestimmter_rechtsbegriff':
        return {
          data: [
            {
              atomares_tbm_id: 'tbm-1',
              begriff: 'besonders geschuetzte Arten',
              id: 'bestimmt-1',
              node_type: 'bestimmter_rechtsbegriff',
            },
          ],
        };
      case 'legaldefinition':
        return {
          data: [
            {
              begriff: 'besonders geschuetzte Arten',
              bestimmter_rechtsbegriff_id: 'bestimmt-1',
              definition: 'Tier- und Pflanzenarten gemaess § 7.',
              id: 'legaldefinition-1',
              node_type: 'legaldefinition',
              source_jurabk: 'BNatSchG',
              source_paragraph_nr: '7',
            },
          ],
        };
      case 'unbestimmter_rechtsbegriff':
        return {
          data: [
            {
              atomares_tbm_id: 'tbm-2',
              auslegung: 'Gesamtauslegung aus dem Begriffsknoten.',
              begriff: 'beteiligte Kreise',
              id: 'unbestimmt-1',
              node_type: 'unbestimmter_rechtsbegriff',
            },
          ],
        };
      case 'auslegungsvorschlag':
        return {
          data: [
            {
              id: 'auslegung-1',
              methode: 'Wortlaut',
              node_type: 'auslegungsvorschlag',
              text: 'Der Wortlaut spricht fuer eine weite Auslegung.',
              unbestimmter_rechtsbegriff_id: 'unbestimmt-1',
            },
            {
              id: 'auslegung-2',
              methode: 'Systematik',
              node_type: 'auslegungsvorschlag',
              text: 'Die Systematik bestaetigt die Beteiligung weiterer Gruppen.',
              unbestimmter_rechtsbegriff_id: 'unbestimmt-1',
            },
          ],
        };
      case 'expliziter_verweis':
        return {
          data: [
            {
              absatz_nr: '1',
              atomares_tbm_id: null,
              gesetz: 'EnWG',
              id: 'verweis-1',
              kontext: ['Planfeststellung'],
              node_type: 'expliziter_verweis',
              paragraph_nr: '43',
              rechtsfolge_id: 'rechtsfolge-1',
              satz_nr: '2',
              untergliederung: null,
              verweis_typ: 'explizit',
            },
          ],
        };
      default:
        return { data: [] };
    }
  },
}));

vi.mock('@/features/ui/alert/Alert', async () => {
  const { MockAlert, MockAlertDescription, MockAlertTitle } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    Alert: MockAlert,
    AlertDescription: MockAlertDescription,
    AlertTitle: MockAlertTitle,
  };
});

vi.mock('@/features/ui/badge/Badge', () => ({
  Badge: (props: { children: ReactNode }) => <span>{props.children}</span>,
}));

vi.mock('@/features/ui/swimlanes/SwimlaneHeaderPortal', async () => {
  const { MockSwimlaneHeaderPortal } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    SwimlaneHeaderPortal: MockSwimlaneHeaderPortal,
  };
});

vi.mock('@/features/ui/ai/AiSparklesChip', () => ({
  AiSparklesChip: () => <span aria-hidden="true">AI</span>,
}));

vi.mock('@/features/ui/button/Button', async () => {
  const { MockButton } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    Button: MockButton,
  };
});

vi.mock('@/features/ui/button/SplitButton', () => ({
  SplitButton: (props: {
    checked: boolean;
    checkedLabel?: string;
    uncheckedLabel?: string;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      aria-pressed={props.checked}
      onClick={() => props.onCheckedChange?.(!props.checked)}
    >
      {props.checked ? props.checkedLabel : props.uncheckedLabel}
    </button>
  ),
}));

vi.mock('@/features/ui/tabs/Tabs', () => ({
  Tabs: (props: { children: ReactNode }) => <div>{props.children}</div>,
  TabsContent: (props: { children: ReactNode }) => <div>{props.children}</div>,
  TabsList: (props: { children: ReactNode }) => <div>{props.children}</div>,
  TabsTrigger: (props: { children: ReactNode }) => (
    <button type="button">{props.children}</button>
  ),
}));

vi.mock('../../rechtsgrundlage/AiTopicNormContext', () => ({
  AiTopicNormProvider: (props: { children: ReactNode }) => (
    <>{props.children}</>
  ),
  useKiTopicNormState: () => topicNormState,
}));

describe('AiSatzDetailView', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = {};
    mocks.navigateMock.mockReset();
    nodeState.hasMultipleAbsaetze = true;
    nodeState.hasMultipleSaetze = false;
    nodeState.missingGesetz = false;
    nodeState.missingNorm = false;
    nodeState.missingSatz = false;
    topicNormState.getSatzReviewStatus.mockReset();
    topicNormState.getSatzReviewStatus.mockReturnValue('unchecked');
    topicNormState.isSatzChecked.mockReset();
    topicNormState.isSatzChecked.mockReturnValue(false);
    topicNormState.toggleSatzChecked.mockReset();
    topicNormState.topicNorm.satz_statuses = {};
  });

  it('renders an error state when no sentence is selected', () => {
    render(<AiSatzDetailView />);

    expect(screen.getByText('Rechtsmethodik')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Zurueck zur Norm' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Rechtsmethodik konnte nicht geladen werden'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Die Satz-Rechtsmethodik ist nicht verfuegbar.'),
    ).toBeInTheDocument();
  });

  it('renders sentence-rooted rechtsmethodik content without requiring topicNormId', () => {
    routeState.search = { rechtsmethodikSatzId: 'satz-1' };

    render(<AiSatzDetailView />);

    expect(screen.getByText('BNatSchG § 17')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Zurueck zur Norm' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Absatz 1')).toBeInTheDocument();
    expect(screen.getByText('Typ')).toBeInTheDocument();
    expect(screen.getByText('Materiell-rechtlich')).toBeInTheDocument();
    expect(screen.getByText('Wenn-dann')).toBeInTheDocument();
    expect(screen.getByText('Tatbestandsmerkmale (2)')).toBeInTheDocument();
    expect(
      screen.getByText('1: Pruefe, ob wild lebenden Tieren nachgestellt wird!'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Praedikatenlogik: TBM 1 und TBM 2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rechtsfolge')).toBeInTheDocument();
    expect(screen.getByText('Sollensanordnung')).toBeInTheDocument();
    expect(screen.getByText('Gebundene Entscheidung')).toBeInTheDocument();
    expect(screen.getByText('Es ist verboten')).toBeInTheDocument();
    expect(
      screen.getByText('Bestimmte Rechtsbegriffe (1)'),
    ).toBeInTheDocument();
    expect(screen.getByText('besonders geschuetzte Arten')).toBeInTheDocument();
    expect(
      screen.getByText('Tier- und Pflanzenarten gemaess § 7.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Quelle: BNatSchG § 7')).toBeInTheDocument();
    expect(
      screen.getByText('Unbestimmte Rechtsbegriffe (1)'),
    ).toBeInTheDocument();
    expect(screen.getByText('beteiligte Kreise')).toBeInTheDocument();
    expect(
      screen.getByText('Der Wortlaut spricht fuer eine weite Auslegung.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Gesamtauslegung')).not.toHaveLength(0);
    expect(
      screen.getByText('Gesamtauslegung aus dem Begriffsknoten.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Die Systematik bestaetigt die Beteiligung weiterer Gruppen.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Verweise (1)')).toBeInTheDocument();
    expect(screen.getByText('§ 43 Absatz 1 Satz 2 EnWG')).toBeInTheDocument();
    expect(screen.queryByText('explizit')).not.toBeInTheDocument();
  });

  it('keeps the Satz number when the current Absatz has multiple Saetze', () => {
    routeState.search = { rechtsmethodikSatzId: 'satz-1' };
    nodeState.hasMultipleSaetze = true;

    render(<AiSatzDetailView />);

    expect(screen.getByText('Absatz 1 Satz 1')).toBeInTheDocument();
  });

  it('shows back navigation and sentence check action when topicNormId is present', () => {
    routeState.search = {
      rechtsmethodikSatzId: 'satz-1',
      topicNormId: 'topic-norm-1',
    };

    render(<AiSatzDetailView />);

    expect(
      screen.getByRole('link', { name: 'Zurueck zur Norm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Satz pruefen' }),
    ).toBeInTheDocument();
  });

  it('keeps the back navigation when hierarchy data is missing', () => {
    routeState.search = {
      rechtsmethodikSatzId: 'satz-1',
      topicNormId: 'topic-norm-1',
    };
    nodeState.missingNorm = true;

    render(<AiSatzDetailView />);

    expect(
      screen.getByRole('link', { name: 'Zurueck zur Norm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Rechtsmethodik konnte nicht geladen werden'),
    ).toBeInTheDocument();
  });
});
