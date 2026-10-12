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
  missingErmessen: false,
  missingGesetz: false,
  missingSollensanordnungen: false,
  missingNorm: false,
  missingSatz: false,
}));

const topicNormState = vi.hoisted(() => ({
  getSatzReviewStatus: vi.fn(() => 'unchecked'),
  isSatzChecked: vi.fn(() => false),
  toggleSatzChecked: vi.fn(),
  topicNorm: {
    satzStatuses: {} as Record<string, 'checked' | 'needs_revision'>,
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
  useNode: (nodeRef: { id: string; nodeType: string } | null) => {
    if (nodeRef?.nodeType === 'satz') {
      if (nodeState.missingSatz) {
        return { data: null };
      }

      return {
        data: {
          absatzId: 'absatz-1',
          formel: 'TBM 1 und TBM 2',
          id: nodeRef.id,
          markers: [],
          nodeType: 'satz',
          normTypLvl1: 'materiell-rechtlich',
          normTypLvl2: 'wenn-dann',
          satzNr: '1',
          text: 'Es ist verboten, wild lebenden Tieren nachzustellen.',
          wennDann: null,
        },
      };
    }

    if (nodeRef?.nodeType === 'absatz') {
      return {
        data: {
          absatzNr: '1',
          id: nodeRef.id,
          nodeType: 'absatz',
          normId: 'norm-1',
          text: 'Absatztext',
        },
      };
    }

    if (nodeRef?.nodeType === 'norm') {
      if (nodeState.missingNorm) {
        return { data: null };
      }

      return {
        data: {
          gesetzId: 'gesetz-1',
          id: nodeRef.id,
          nodeType: 'norm',
          paragraphNr: '17',
          paragraphTitel: null,
          regelungsgegenstand: null,
          text: 'Normtext',
        },
      };
    }

    if (nodeRef?.nodeType === 'gesetz') {
      if (nodeState.missingGesetz) {
        return { data: null };
      }

      return {
        data: {
          id: nodeRef.id,
          jurabk: 'BNatSchG',
          name: 'Bundesnaturschutzgesetz',
          nodeType: 'gesetz',
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
          { id: 'absatz-1', nodeType: 'absatz' },
          { id: 'absatz-2', nodeType: 'absatz' },
        ]
      : [{ id: 'absatz-1', nodeType: 'absatz' }];
  },
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: (nodeType: string) => {
    switch (nodeType) {
      case 'satz':
        return {
          data: [
            {
              absatzId: 'absatz-1',
              id: 'satz-1',
              markers: [],
              nodeType: 'satz',
              position: 1,
              satzNr: '1',
              text: 'Es ist verboten, wild lebenden Tieren nachzustellen.',
            },
            ...(nodeState.hasMultipleSaetze
              ? [
                  {
                    absatzId: 'absatz-1',
                    id: 'satz-2',
                    markers: [],
                    nodeType: 'satz',
                    position: 2,
                    satzNr: '2',
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
              nodeType: 'atomares_tbm',
              prueffrage: 'Pruefe, ob wild lebenden Tieren nachgestellt wird!',
              pruefgegenstand: null,
              satzId: 'satz-1',
              text: 'TBM 1',
            },
            {
              id: 'tbm-2',
              nodeType: 'atomares_tbm',
              prueffrage: 'Pruefe, ob Tiere gefangen oder verletzt werden!',
              pruefgegenstand: null,
              satzId: 'satz-1',
              text: 'TBM 2',
            },
          ],
        };
      case 'rechtsfolge':
        return {
          data: [
            {
              id: 'rechtsfolge-1',
              nodeType: 'rechtsfolge',
              satzId: 'satz-1',
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
              nodeType: 'adressat',
              rechtsfolgeId: 'rechtsfolge-1',
            },
          ],
        };
      case 'ermessensspielraum':
        if (nodeState.missingErmessen) {
          return { data: [] };
        }

        return {
          data: [
            {
              entscheidung: 'Ermessensentscheidung',
              id: 'ermessensspielraum-1',
              nodeType: 'ermessensspielraum',
              rechtsfolgeId: 'rechtsfolge-1',
            },
          ],
        };
      case 'ermessensart':
        if (nodeState.missingErmessen) {
          return { data: [] };
        }

        return {
          data: [
            {
              art: 'Auswahlermessen',
              id: 'ermessensart-1',
              nodeType: 'ermessensart',
              rechtsfolgeId: 'rechtsfolge-1',
            },
          ],
        };
      case 'sollensanordnungen':
        if (nodeState.missingSollensanordnungen) {
          return { data: [] };
        }

        return {
          data: [
            {
              id: 'soll-1',
              kategorie: 'Sollensanordnung',
              nodeType: 'sollensanordnungen',
              rechtsfolgeId: 'rechtsfolge-1',
            },
          ],
        };
      case 'bestimmter_rechtsbegriff':
        return {
          data: [
            {
              atomaresTbmId: 'tbm-1',
              begriff: 'besonders geschuetzte Arten',
              id: 'bestimmt-1',
              nodeType: 'bestimmter_rechtsbegriff',
            },
          ],
        };
      case 'legaldefinition':
        return {
          data: [
            {
              begriff: 'besonders geschuetzte Arten',
              bestimmterRechtsbegriffId: 'bestimmt-1',
              definition: 'Tier- und Pflanzenarten gemaess § 7.',
              id: 'legaldefinition-1',
              nodeType: 'legaldefinition',
              sourceJurabk: 'BNatSchG',
              sourceParagraphNr: '7',
            },
          ],
        };
      case 'unbestimmter_rechtsbegriff':
        return {
          data: [
            {
              atomaresTbmId: 'tbm-2',
              auslegung: 'Gesamtauslegung aus dem Begriffsknoten.',
              begriff: 'beteiligte Kreise',
              id: 'unbestimmt-1',
              nodeType: 'unbestimmter_rechtsbegriff',
            },
          ],
        };
      case 'auslegungsvorschlag':
        return {
          data: [
            {
              id: 'auslegung-1',
              methode: 'Wortlaut',
              nodeType: 'auslegungsvorschlag',
              text: 'Der Wortlaut spricht fuer eine weite Auslegung.',
              unbestimmterRechtsbegriffId: 'unbestimmt-1',
            },
            {
              id: 'auslegung-2',
              methode: 'Systematik',
              nodeType: 'auslegungsvorschlag',
              text: 'Die Systematik bestaetigt die Beteiligung weiterer Gruppen.',
              unbestimmterRechtsbegriffId: 'unbestimmt-1',
            },
          ],
        };
      case 'expliziter_verweis':
        return {
          data: [
            {
              absatzNr: '1',
              atomaresTbmId: null,
              gesetz: 'EnWG',
              id: 'verweis-1',
              kontext: ['Planfeststellung'],
              nodeType: 'expliziter_verweis',
              paragraphNr: '43',
              rechtsfolgeId: 'rechtsfolge-1',
              satzNr: '2',
              untergliederung: null,
              verweisTyp: 'explizit',
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
    nodeState.missingErmessen = false;
    nodeState.missingGesetz = false;
    nodeState.missingSollensanordnungen = false;
    nodeState.missingNorm = false;
    nodeState.missingSatz = false;
    topicNormState.getSatzReviewStatus.mockReset();
    topicNormState.getSatzReviewStatus.mockReturnValue('unchecked');
    topicNormState.isSatzChecked.mockReset();
    topicNormState.isSatzChecked.mockReturnValue(false);
    topicNormState.toggleSatzChecked.mockReset();
    topicNormState.topicNorm.satzStatuses = {};
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
    expect(screen.getByText('Ermessensentscheidung')).toBeInTheDocument();
    expect(screen.getByText('Auswahlermessen')).toBeInTheDocument();
    expect(
      screen.queryByText('Gebundene Entscheidung'),
    ).not.toBeInTheDocument();
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

  it('keeps the Rechtsfolge section when the sentence has no badge evidence', () => {
    routeState.search = { rechtsmethodikSatzId: 'satz-1' };
    nodeState.missingErmessen = true;
    nodeState.missingSollensanordnungen = true;

    render(<AiSatzDetailView />);

    expect(screen.getByText('Rechtsfolge')).toBeInTheDocument();
    expect(screen.getByText('Es ist verboten')).toBeInTheDocument();
    expect(screen.queryByText('Sollensanordnung')).not.toBeInTheDocument();
    expect(screen.queryByText('Ermessensentscheidung')).not.toBeInTheDocument();
    expect(screen.queryByText('Auswahlermessen')).not.toBeInTheDocument();
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
