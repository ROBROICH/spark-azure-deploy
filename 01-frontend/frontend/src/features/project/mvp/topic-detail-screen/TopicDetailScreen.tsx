import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useGraphPerfReadyOnce } from '@/db/nodes/hooks/useGraphPerfDiagnostics';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { getRouteApi } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackButtonBar } from './screen-content/BackButtonBar';
import { BackButtonBarSkeleton } from './screen-content/BackButtonBarSkeleton';
import { MvpPdfPopoutScopeRegistration } from './pdf-view-swimlane/MvpPdfPopoutScopeRegistration';
import { RechtsgrundlageDialog } from './screen-content/rechtsgrundlage-dialog/RechtsgrundlageDialog';
import {
  mvpLaneOrderPreferenceSchema,
  type MvpLaneOrderPreference,
} from './mvp.search';
import { getLaneOrderSearchState } from './mvpPage.logic';
import { TopicDetailScreenSwimlanes } from './topic-detail-screen.swimlanes';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');
const MVP_LANE_ORDER_STORAGE_KEY = 'mvp-lane-order-preference';
const MvpFeedbackDialogMount = lazy(() =>
  import('./screen-content/MvpFeedbackDialogMount').then((module) => ({
    default: module.MvpFeedbackDialogMount,
  })),
);

/**
 * Owns the MVP topic detail page state: route params, search params,
 * preview document caching, descendant document loading, dialog open
 * state, and composition of the three-pane layout.
 *
 * @returns The MVP topic detail page layout.
 */
const TopicDetailScreenContent = () => {
  const { verfahrenId, topicName } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const { laneOrder, previewDocumentId, selectedDocumentId } = route.useSearch({
    select: (search) => ({
      laneOrder: search.laneOrder,
      previewDocumentId: search.previewDocumentId,
      selectedDocumentId: search.selectedDocumentId,
    }),
  });
  const navigate = route.useNavigate();
  const topicRef = { id: topicName, node_type: 'topic' as const };
  const { data: topicDocuments } = useDescendantNodes('dokument', topicRef);
  const hasTopicMutationRights = useHasTopicMutationRights();
  const canMutateTopic = hasTopicMutationRights(topicName);
  const [isRechtsgrundlageDialogOpen, setIsRechtsgrundlageDialogOpen] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral dialog open state belongs to this page owner
    useState(false);
  const [laneOrderPreference, setLaneOrderPreference] = useLocalStorage<
    MvpLaneOrderPreference,
    typeof mvpLaneOrderPreferenceSchema
  >({
    key: MVP_LANE_ORDER_STORAGE_KEY,
    initialValue: 'documentsFirst',
    schema: mvpLaneOrderPreferenceSchema,
  });
  const effectiveLaneOrderPreference = laneOrder ?? laneOrderPreference;

  // eslint-disable-next-line no-restricted-syntax -- route canonicalization is required so shared MVP URLs explicitly encode lane order instead of depending on localStorage
  useEffect(() => {
    if (laneOrder !== undefined) {
      return;
    }

    navigate({
      search: (prev) => ({
        ...prev,
        ...getLaneOrderSearchState({
          currentLaneOrder: effectiveLaneOrderPreference,
          currentLeftPanelTab: prev.leftPanelTab,
          nextLaneOrder: effectiveLaneOrderPreference,
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  }, [effectiveLaneOrderPreference, laneOrder, navigate]);

  useGraphPerfReadyOnce({
    name: 'mvp.topicDocuments.ready',
    enabled: topicDocuments.length > 0,
    detail: {
      previewDocumentId,
      topicDocumentsCount: topicDocuments.length,
      topicId: topicName,
      verfahrenId,
    },
  });

  useGraphPerfReadyOnce({
    name: 'mvp.baseLanes.ready',
    enabled: topicDocuments.length > 0,
    detail: {
      previewDocumentId,
      selectedDocumentId,
      topicDocumentsCount: topicDocuments.length,
      topicId: topicName,
      verfahrenId,
    },
  });

  return (
    <div className="flex h-full min-h-0 w-full flex-1 self-stretch">
      <Suspense fallback={null}>
        <MvpPdfPopoutScopeRegistration topicDocuments={topicDocuments} />
      </Suspense>
      <Suspense fallback={null}>
        <MvpFeedbackDialogMount />
      </Suspense>
      <RechtsgrundlageDialog
        canMutateTopic={canMutateTopic}
        onOpenChange={setIsRechtsgrundlageDialogOpen}
        open={isRechtsgrundlageDialogOpen && canMutateTopic}
      />
      <div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden border border-border-primary bg-neutral-white">
        <Suspense fallback={<BackButtonBarSkeleton />}>
          <BackButtonBar
            laneOrderPreference={effectiveLaneOrderPreference}
            onLaneOrderChange={(nextLaneOrderPreference) => {
              setLaneOrderPreference(nextLaneOrderPreference);
              navigate({
                search: (prev) => ({
                  ...prev,
                  ...getLaneOrderSearchState({
                    currentLaneOrder:
                      prev.laneOrder ?? effectiveLaneOrderPreference,
                    currentLeftPanelTab: prev.leftPanelTab,
                    nextLaneOrder: nextLaneOrderPreference,
                  }),
                }),
                replace: true,
                resetScroll: false,
              });
            }}
          />
        </Suspense>
        <section
          aria-label={t('MvpPage.sectionAriaLabel')}
          className="min-h-0 flex-1 overflow-hidden"
        >
          <TopicDetailScreenSwimlanes
            canMutateTopic={canMutateTopic}
            effectiveLaneOrderPreference={effectiveLaneOrderPreference}
            onOpenRechtsgrundlageDialog={() =>
              setIsRechtsgrundlageDialogOpen(true)
            }
            topicDocuments={topicDocuments}
          />
        </section>
      </div>
    </div>
  );
};

export const TopicDetailScreen = () => {
  const { topicName } = route.useParams();

  return <TopicDetailScreenContent key={topicName} />;
};
