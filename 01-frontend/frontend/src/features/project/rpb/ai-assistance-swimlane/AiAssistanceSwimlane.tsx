import { LawChangeDialogController } from '@/features/project/law-changes/ui/LawChangeDialogController';
import { Accordion } from '@/features/ui/accordion/Accordion';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AiDocumentsSection } from './documents/AiDocumentsSection';
import { AiLegalBasisSection } from './rechtsgrundlage/AiLegalBasisSection';
import { AiNormDetailView } from './rechtsgrundlage/AiNormDetailView';
import { AiNormtextView } from './rechtsgrundlage/AiNormtextView';
import { AiParticipationDetailView } from './participation/AiParticipationDetailView';
import { AiParticipationSection } from './participation/AiParticipationSection';
import { AiRiskWarningsEntry } from './risk-warnings/AiRiskWarningsEntry';
import { AiSatzBewertungDetailView } from './ai-rating/AiSatzBewertungDetailView';
import { AiSatzDetailView } from './ai-rating/rechtsmethodik/AiSatzDetailView';
import { AiTopicHeader } from './shared/AiTopicHeader';
import { AiAssistanceSwimlaneSkeleton } from './AiAssistanceSwimlaneSkeleton';
import { useRpbVaeNodeUrlState } from '../workspace-state/RpbOutlineContext';

const RiskWarningsPanel = lazy(() =>
  import('./risk-warnings/RiskWarningsPanel').then((m) => ({
    default: m.RiskWarningsPanel,
  })),
);

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type AiPanelRouteSearch = {
  aiLane?: 'risikohinweise';
  lawChangeId?: string;
  participationSubtopicId?: string;
  rechtsmethodikSatzId?: string;
  satzId?: string;
  showNormtext?: boolean;
  topicNormId?: string;
};

type AiPanelRouteState =
  | { type: 'risk-warnings' }
  | { type: 'participation-detail' }
  | { type: 'satz-bewertung-detail' }
  | { type: 'rechtsmethodik-detail' }
  | { topicNormId: string; type: 'normtext' }
  | { type: 'norm-detail' }
  | { type: 'overview' };

/**
 * Preserves detail-route precedence when stale search params coexist.
 */
const resolveKiPanelRoute = (search: AiPanelRouteSearch): AiPanelRouteState => {
  if (search.aiLane === 'risikohinweise') {
    return { type: 'risk-warnings' };
  }

  if (search.participationSubtopicId) {
    return { type: 'participation-detail' };
  }

  if (search.satzId) {
    return { type: 'satz-bewertung-detail' };
  }

  if (search.rechtsmethodikSatzId) {
    return { type: 'rechtsmethodik-detail' };
  }

  if (search.topicNormId && search.showNormtext) {
    return {
      topicNormId: search.topicNormId,
      type: 'normtext',
    };
  }

  if (search.topicNormId) {
    return { type: 'norm-detail' };
  }

  return { type: 'overview' };
};

const AiNoTopicHint = () => {
  const { t } = useTranslation('Rpb');

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] leading-[18px] text-blue-900 shadow-sm">
      {t('aiAssistance.noAssignedTopicHint')}
    </div>
  );
};

/**
 * Keeps in-session accordion collapse separate from URL state while resetting
 * that local collapse when the selected topic or outline node changes.
 */
const AiAssistanceSwimlaneOverview = (props: {
  isSelectedNoTopicOutline: boolean;
  overviewScopeKey: string;
}) => {
  const { isSelectedNoTopicOutline, overviewScopeKey } = props;
  const { aiOverviewSection, topicId } = route.useSearch({
    select: (search) => ({
      aiOverviewSection: search.aiOverviewSection,
      topicId: search.topicId,
    }),
  });
  const navigate = route.useNavigate();
  const [hasCollapsedOverviewSection, setHasCollapsedOverviewSection] =
    // eslint-disable-next-line no-restricted-syntax -- distinguishes initial default-open Rechtsgrundlage from an in-session user collapse without introducing a URL sentinel value.
    useState(false);
  // Reset the in-session collapse flag when the selection changes, instead of
  // remounting the whole (suspending) overview via a `key`, which would flash
  // the skeleton on every topic/outline switch.
  const [previousScopeKey, setPreviousScopeKey] =
    // eslint-disable-next-line no-restricted-syntax -- tracks the previous selection to drive a render-time state reset without an effect or a keyed remount.
    useState(overviewScopeKey);
  if (previousScopeKey !== overviewScopeKey) {
    setPreviousScopeKey(overviewScopeKey);
    setHasCollapsedOverviewSection(false);
  }
  const showTopicSections = !isSelectedNoTopicOutline || Boolean(topicId);
  const selectedOverviewSection =
    aiOverviewSection ?? (hasCollapsedOverviewSection ? '' : 'rechtsgrundlage');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 pt-2">
      {isSelectedNoTopicOutline ? <AiNoTopicHint /> : null}
      {showTopicSections ? (
        <Accordion
          type="single"
          collapsible
          value={selectedOverviewSection}
          onValueChange={(nextValue) => {
            const nextSection =
              nextValue === 'rechtsgrundlage' ||
              nextValue === 'beteiligungseingaenge' ||
              nextValue === 'documents'
                ? nextValue
                : undefined;

            setHasCollapsedOverviewSection(nextSection === undefined);

            void navigate({
              search: (prev) => ({
                ...prev,
                aiOverviewSection: nextSection,
              }),
              replace: true,
              resetScroll: false,
            });
          }}
        >
          <AiLegalBasisSection />
          <AiParticipationSection />
          <AiDocumentsSection />
        </Accordion>
      ) : null}
      <AiRiskWarningsEntry />
    </div>
  );
};

const AiAssistanceOverviewRoute = (props: { lawChangeDialog: ReactNode }) => {
  const { lawChangeDialog } = props;
  const { selectedVaeNode, selectedVaeNodeMutationTopicId } =
    useRpbVaeNodeUrlState();
  const { topicId, outlineNodeId } = route.useSearch({
    select: (search) => ({
      topicId: search.topicId,
      outlineNodeId: search.outlineNodeId,
    }),
  });
  const isSelectedNoTopicOutline =
    selectedVaeNode !== null && selectedVaeNodeMutationTopicId === null;
  const overviewScopeKey = `${topicId ?? 'none'}:${outlineNodeId ?? 'none'}`;

  return (
    <>
      <AiTopicHeader
        titleKey="aiAssistance.title"
        leading={<AiSparklesChip aria-hidden="true" />}
        allowEmptyTopicSelection={isSelectedNoTopicOutline}
      />
      <Suspense fallback={<AiAssistanceSwimlaneSkeleton showHeader={false} />}>
        <AiAssistanceSwimlaneOverview
          overviewScopeKey={overviewScopeKey}
          isSelectedNoTopicOutline={isSelectedNoTopicOutline}
        />
      </Suspense>
      {lawChangeDialog}
    </>
  );
};

/**
 * Centralizes KI lane routing so detail-view selection and law-change dialog
 * cleanup share one ordered interpretation of route search params.
 */
const AiAssistanceSwimlaneContent = () => {
  const routeSearch = route.useSearch({
    select: (search) => ({
      aiLane: search.aiLane,
      lawChangeId: search.lawChangeId,
      participationSubtopicId: search.participationSubtopicId,
      rechtsmethodikSatzId: search.rechtsmethodikSatzId,
      satzId: search.satzId,
      showNormtext: search.showNormtext,
      topicNormId: search.topicNormId,
    }),
  });
  const navigate = route.useNavigate();
  const panelRoute = resolveKiPanelRoute(routeSearch);
  const lawChangeDialog = (
    <LawChangeDialogController
      lawChangeId={routeSearch.lawChangeId}
      onOpenChange={(open) => {
        if (!open) {
          void navigate({
            search: (prev) => ({
              ...prev,
              lawChangeId: undefined,
            }),
            replace: true,
            resetScroll: false,
          });
        }
      }}
      onSelectLawChangeId={(nextLawChangeId) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            lawChangeId: nextLawChangeId,
          }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );

  switch (panelRoute.type) {
    case 'risk-warnings':
      return (
        <Suspense fallback={null}>
          <RiskWarningsPanel />
        </Suspense>
      );
    case 'participation-detail':
      return <AiParticipationDetailView />;
    case 'satz-bewertung-detail':
      return (
        <Suspense fallback={<AiAssistanceSwimlaneSkeleton />}>
          <AiSatzBewertungDetailView />
        </Suspense>
      );
    case 'rechtsmethodik-detail':
      return (
        <>
          <Suspense fallback={<AiAssistanceSwimlaneSkeleton />}>
            <AiSatzDetailView />
          </Suspense>
          {lawChangeDialog}
        </>
      );
    case 'normtext':
      return (
        <>
          <Suspense fallback={<AiAssistanceSwimlaneSkeleton />}>
            <AiNormtextView
              topicNormRef={{
                id: panelRoute.topicNormId,
                nodeType: 'topic_norm',
              }}
            />
          </Suspense>
          {lawChangeDialog}
        </>
      );
    case 'norm-detail':
      return (
        <>
          <Suspense fallback={<AiAssistanceSwimlaneSkeleton />}>
            <AiNormDetailView />
          </Suspense>
          {lawChangeDialog}
        </>
      );
    case 'overview':
      return <AiAssistanceOverviewRoute lawChangeDialog={lawChangeDialog} />;
  }
};

export const AiAssistanceSwimlane = () => {
  return <AiAssistanceSwimlaneContent />;
};
