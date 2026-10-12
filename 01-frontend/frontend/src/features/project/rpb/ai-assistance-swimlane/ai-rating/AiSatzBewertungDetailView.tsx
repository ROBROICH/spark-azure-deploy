import type { NodeRefByType, NodeTypeLiteral } from '@/db/nodes/types';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import {
  hasOutdatedNodeSummary,
  isNodeSummaryOutdated,
} from '@/features/project/versioning/outdatedSummary';
import { useProjectVersionsNavigation } from '@/features/project/versioning/useProjectVersionsNavigation';
import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { AiOutdatedBadge } from '@/features/ui/ai-outdated-badge/AiOutdatedBadge';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { AlertCircle, ChevronLeft } from 'lucide-react';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import {
  AiSatzBewertungFull,
  AiSatzBewertungFullSkeleton,
} from './AiSatzBewertungFull';
import { AiTopicHeader } from '../shared/AiTopicHeader';
import { getAssessmentResultLabel } from './aiBewertungSummary';
import { getNormLabel } from '../rechtsgrundlage/aiNormLabel';
import { StatusBadge } from '../shared/StatusBadge';
import { useTranslation } from 'react-i18next';
import { useRpbBewertungRefreshAction } from './useRpbBewertungRefreshAction';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const createNodeRef = <T extends NodeTypeLiteral>(
  id: string | null | undefined,
  nodeType: T,
) => {
  if (!id) {
    return null;
  }

  return {
    id,
    nodeType: nodeType,
  } satisfies NodeRefByType<T>;
};

const BackToNormButton = () => {
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();

  return (
    <Button
      asChild
      iconOnly
      variant="secondary"
      aria-label={t('aiAssistance.backToNorm')}
    >
      <Link
        to="/verfahren/$verfahrenId/rpb"
        params={{ verfahrenId }}
        search={(prev) => ({
          ...prev,
          satzId: undefined,
        })}
        resetScroll={false}
        aria-label={t('aiAssistance.backToNorm')}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  );
};

type AssessmentHeaderRowProps = {
  accessory?: ReactNode;
  badgeLabel: string;
  bewertungRef: NodeRefByType<'bewertung'>;
  title: string;
};

/**
 * Header row showing the AI assessment title, result badge, disclaimer, and overall feedback buttons.
 */
const AssessmentHeaderRow = (props: AssessmentHeaderRowProps) => {
  const { accessory, badgeLabel, bewertungRef, title } = props;
  const { t } = useTranslation('Rpb');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <AiSparklesChip aria-hidden="true" />
          <p className="min-w-0 truncate text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950">
            {title}
          </p>
          <NodeFeedbackThumbButtons targetRef={bewertungRef} />
        </div>
        <StatusBadge
          badge={{
            label: badgeLabel,
            variant: 'neutral',
          }}
        />
        {accessory}
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
        <p className="text-[14px] leading-[19px] font-normal text-brand-950">
          {t('aiAssistance.aiAssessmentDisclaimer')}
        </p>
      </div>
    </div>
  );
};

const AiSatzBewertungOutdatedBadge = (props: {
  canMutateTopic: boolean;
  normId: string;
  verfahrenId: string;
}) => {
  const { canMutateTopic, normId, verfahrenId } = props;
  const { t } = useTranslation('Rpb');
  const handleShowVersions = useProjectVersionsNavigation(verfahrenId);
  const refreshAction = useRpbBewertungRefreshAction({
    canMutateTopic,
    normId,
    verfahrenId,
  });

  return (
    <AiOutdatedBadge
      label={t('aiAssistance.outdatedBadge.label')}
      tooltip={{
        closeLabel: t('aiAssistance.outdatedBadge.close'),
        description: t('aiAssistance.outdatedBadge.description'),
        instruction: t('aiAssistance.outdatedBadge.instruction'),
        refreshAction: {
          disabled: refreshAction.isRefreshDisabled,
          isLoading: refreshAction.isRefreshRunning,
          label: t('aiAssistance.outdatedBadge.refresh'),
          onClick: refreshAction.onRefresh,
        },
        title: t('aiAssistance.outdatedBadge.title'),
        versionAction: {
          label: t('aiAssistance.outdatedBadge.showVersions'),
          onClick: handleShowVersions,
        },
      }}
    />
  );
};

/**
 * Resolves the sentence-scoped Bewertung detail from `satzId`, restores the
 * swimlane header context for the selected norm, and shows an error state when
 * no sentence assessment can be loaded for the current route selection.
 */
export const AiSatzBewertungDetailView = () => {
  const { t } = useTranslation('Rpb');
  const { satzId, topicId, topicNormId } = route.useSearch({
    select: (search) => ({
      satzId: search.satzId,
      topicId: search.topicId,
      topicNormId: search.topicNormId,
    }),
  });
  const { verfahrenId } = route.useParams();
  const satzRef = createNodeRef(satzId, 'satz');
  const { data: satz } = useNode(satzRef);
  const absatzRef = createNodeRef(satz?.absatzId, 'absatz');
  const { data: absatz } = useNode(absatzRef);
  const normRef = createNodeRef(absatz?.normId, 'norm');
  const { data: norm } = useNode(normRef);
  const bewertungRefs = useDescendants('bewertung', satzRef);
  const bewertungRef = bewertungRefs[0];
  const bewertungQuelleRefs = useDescendants('bewertung_quelle', bewertungRef);
  const { data: bewertung } = useNode(bewertungRef);
  const hasTopicMutationRights = useHasTopicMutationRights();
  const canMutateTopic = hasTopicMutationRights(topicId);
  const isAssessmentOutdated =
    isNodeSummaryOutdated(bewertungRef) ||
    hasOutdatedNodeSummary(bewertungQuelleRefs);
  const trailingTitle = norm
    ? t('aiAssistance.assessmentTitleWithNorm', {
        norm: getNormLabel(norm),
      })
    : null;
  const assessmentResultLabel = getAssessmentResultLabel(t, bewertung);

  if (!satzId || !bewertung) {
    return (
      <>
        <AiTopicHeader
          titleKey="aiAssistance.assessmentTitle"
          showTopicSelect={false}
          leading={topicNormId ? <BackToNormButton /> : undefined}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>
              {t('aiAssistance.assessmentLoadErrorTitle')}
            </AlertTitle>
            <AlertDescription>
              {t('aiAssistance.assessmentLoadErrorDescription')}
            </AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <AiTopicHeader
        titleKey="aiAssistance.assessmentTitle"
        showTopicSelect={false}
        leading={topicNormId ? <BackToNormButton /> : undefined}
        trailing={
          trailingTitle ? (
            <span className="max-w-56 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
              {trailingTitle}
            </span>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <FeedbackLookupProvider targetRefs={bewertungRefs.slice(0, 1)}>
          <AssessmentHeaderRow
            title={t('aiAssistance.aiAssessment')}
            bewertungRef={{ id: bewertung.id, nodeType: 'bewertung' }}
            badgeLabel={assessmentResultLabel}
            accessory={
              isAssessmentOutdated && norm?.id ? (
                <AiSatzBewertungOutdatedBadge
                  canMutateTopic={canMutateTopic}
                  normId={norm.id}
                  verfahrenId={verfahrenId}
                />
              ) : undefined
            }
          />
        </FeedbackLookupProvider>
        <Suspense fallback={<AiSatzBewertungFullSkeleton />}>
          <AiSatzBewertungFull
            bewertungRef={{
              id: bewertung.id,
              nodeType: 'bewertung',
            }}
            summaryText={bewertung.kurzform ?? ''}
          />
        </Suspense>
      </div>
    </>
  );
};
