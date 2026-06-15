import type { NodePayloadByType } from '@/db/nodes/types';
import { PdfPopoutSwimlane } from '@/features/project/pdf-popout/PdfPopoutSwimlane';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { Button } from '@/features/ui/button/Button';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { getRouteApi } from '@tanstack/react-router';
import { File, Scale, ScanSearch, SquarePen } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentsSwimlane } from './documents-swimlane/DocumentsSwimlane';
import { DocumentsSwimlaneSkeleton } from './documents-swimlane/DocumentsSwimlaneSkeleton';
import { FundstellenSwimlane } from './fundstellen-swimlane/FundstellenSwimlane';
import {
  type MvpLaneOrderPreference,
  type MvpLeftPanelTab,
} from './mvp.search';
import {
  getLeftPanelTabSearchValue,
  getPreferredPrimaryLaneId,
} from './mvpPage.logic';
import { RechtsgrundlageSwimlane } from './rechtsgrundlage-swimlane/RechtsgrundlageSwimlane';
import { RechtsgrundlageSwimlaneSkeleton } from './rechtsgrundlage-swimlane/RechtsgrundlageSwimlaneSkeleton';
import { MvpFundstellenProvider } from './screen-content/MvpFundstellenContext';

const DOKUMENTE_LANE_ID = 'dokumente' satisfies MvpLeftPanelTab;
const RECHTSGRUNDLAGE_LANE_ID = 'rechtsgrundlage' satisfies MvpLeftPanelTab;
const FUNDSTELLEN_LANE_ID = 'fundstellen';
const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type TopicDetailScreenSwimlanesProps = {
  canMutateTopic: boolean;
  effectiveLaneOrderPreference: MvpLaneOrderPreference;
  onOpenRechtsgrundlageDialog: () => void;
  topicDocuments: NodePayloadByType<'dokument'>[];
};

/**
 * Composes the MVP topic swimlane layout from route-backed lane state,
 * document data, mutation rights, and the shared PDF popout lane.
 *
 * @param props Topic documents, lane preference, mutation state, and dialog callback.
 * @returns The configured MVP swimlane layout.
 */
export const TopicDetailScreenSwimlanes = (
  props: TopicDetailScreenSwimlanesProps,
) => {
  const {
    canMutateTopic,
    effectiveLaneOrderPreference,
    onOpenRechtsgrundlageDialog,
    topicDocuments,
  } = props;
  const { topicName } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const { leftPanelTab, selectedDocumentId } = route.useSearch({
    select: (search) => ({
      leftPanelTab: search.leftPanelTab,
      selectedDocumentId: search.selectedDocumentId,
    }),
  });
  const navigate = route.useNavigate();
  const { isPoppedOut } = usePdfPopout();
  const preferredPrimaryLaneId = getPreferredPrimaryLaneId(
    effectiveLaneOrderPreference,
  );
  const documentsGroupTab = {
    value:
      leftPanelTab ??
      (selectedDocumentId !== undefined
        ? DOKUMENTE_LANE_ID
        : preferredPrimaryLaneId),
    onValueChange: (nextValue: string) => {
      if (
        nextValue !== DOKUMENTE_LANE_ID &&
        nextValue !== RECHTSGRUNDLAGE_LANE_ID
      ) {
        return;
      }

      navigate({
        search: (prev) => ({
          ...prev,
          laneOrder: prev.laneOrder ?? effectiveLaneOrderPreference,
          leftPanelTab: getLeftPanelTabSearchValue(
            nextValue,
            effectiveLaneOrderPreference,
          ),
        }),
        replace: true,
        resetScroll: false,
      });
    },
  } as const;
  const groupedLaneIds =
    effectiveLaneOrderPreference === 'documentsFirst'
      ? [DOKUMENTE_LANE_ID, RECHTSGRUNDLAGE_LANE_ID]
      : [RECHTSGRUNDLAGE_LANE_ID, DOKUMENTE_LANE_ID];
  const selectedDocumentLabel =
    topicDocuments
      .find((topicDocument) => topicDocument.id === selectedDocumentId)
      ?.filename.split('/')
      .pop() ?? null;
  const groupedLanes = groupedLaneIds.map((laneId) => {
    if (laneId === DOKUMENTE_LANE_ID) {
      return (
        <Swimlanes.Lane
          key={DOKUMENTE_LANE_ID}
          id={DOKUMENTE_LANE_ID}
          title={t('DocumentsPanel.tabs.dokumente')}
          icon={File}
        >
          <Suspense fallback={<DocumentsSwimlaneSkeleton />}>
            <DocumentsSwimlane
              canMutateTopic={canMutateTopic}
              topicDocuments={topicDocuments}
            />
          </Suspense>
        </Swimlanes.Lane>
      );
    }

    return (
      <Swimlanes.Lane
        key={RECHTSGRUNDLAGE_LANE_ID}
        id={RECHTSGRUNDLAGE_LANE_ID}
        title={t('RechtsgrundlagePanel.title')}
        icon={Scale}
        action={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('RechtsgrundlageDialog.openAriaLabel')}
            disabled={!canMutateTopic}
            onClick={onOpenRechtsgrundlageDialog}
          >
            <SquarePen aria-hidden="true" />
          </Button>
        }
      >
        <Suspense fallback={<RechtsgrundlageSwimlaneSkeleton />}>
          <RechtsgrundlageSwimlane
            canMutateTopic={canMutateTopic}
            selectedDocumentLabel={selectedDocumentLabel}
          />
        </Suspense>
      </Swimlanes.Lane>
    );
  });

  return (
    <MvpFundstellenProvider topicId={topicName}>
      <Swimlanes className="h-full">
        <Swimlanes.Group
          unfoldOn={isPoppedOut ? 'always' : 'desktop'}
          {...documentsGroupTab}
          ariaLabel={t('MvpPage.primaryGroupAriaLabel')}
        >
          {groupedLanes}
        </Swimlanes.Group>

        <Swimlanes.Lane
          id={FUNDSTELLEN_LANE_ID}
          title={t('DocumentsPanel.tabs.fundstellen')}
          icon={ScanSearch}
        >
          <FundstellenSwimlane topicDocuments={topicDocuments} />
        </Swimlanes.Lane>

        <Suspense
          fallback={
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white" />
          }
        >
          <PdfPopoutSwimlane />
        </Suspense>
      </Swimlanes>
    </MvpFundstellenProvider>
  );
};
