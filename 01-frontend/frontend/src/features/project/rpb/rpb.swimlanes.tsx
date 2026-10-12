import { PdfPopoutSwimlane } from '@/features/project/pdf-popout/PdfPopoutSwimlane';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { useSwimlanesGroupSearchState } from '@/features/ui/swimlanes/useSwimlanesGroupSearchState';
import { getRouteApi } from '@tanstack/react-router';
import { Book, ListOrdered, Sparkles } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BeschlussSwimlane } from './beschluss-swimlane/BeschlussSwimlane';
import { BeschlussSwimlaneSkeleton } from './beschluss-swimlane/BeschlussSwimlaneSkeleton';
import { AiAssistanceSwimlane } from './ai-assistance-swimlane/AiAssistanceSwimlane';
import { OutlineSwimlane } from './outline-swimlane/OutlineSwimlane';
import { OutlineSwimlaneSkeleton } from './outline-swimlane/OutlineSwimlaneSkeleton';
import {
  rpbLeftPanelTabSearchSchema,
  type RpbLeftPanelTab,
} from './rpb.search';
import { RpbFeatureProvider } from './workspace-state/RpbFeatureContext';
import { RpbOutlineProvider } from './workspace-state/RpbOutlineContext';

const OUTLINE_LANE_ID = 'gliederung' satisfies RpbLeftPanelTab;
const BESCHLUSS_LANE_ID = 'beschluss' satisfies RpbLeftPanelTab;
const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type LeftPanelGroupProps = {
  leftPanelTab: ReturnType<typeof useSwimlanesGroupSearchState>;
};

const LeftPanelGroupSkeleton = (props: LeftPanelGroupProps) => {
  const { leftPanelTab } = props;
  const { t } = useTranslation('Rpb');
  const { isPoppedOut } = usePdfPopout();

  return (
    <Swimlanes.Group
      unfoldOn={isPoppedOut ? 'always' : 'desktop'}
      {...leftPanelTab}
      ariaLabel={t('page.leftGroupAriaLabel')}
    >
      <Swimlanes.Lane
        id={OUTLINE_LANE_ID}
        title={t('gliederung.title')}
        icon={ListOrdered}
      >
        <OutlineSwimlaneSkeleton />
      </Swimlanes.Lane>
      <Swimlanes.Lane
        id={BESCHLUSS_LANE_ID}
        title={t('beschluss.title')}
        icon={Book}
      >
        <BeschlussSwimlaneSkeleton />
      </Swimlanes.Lane>
    </Swimlanes.Group>
  );
};

const LeftPanelGroup = (props: LeftPanelGroupProps) => {
  const { leftPanelTab } = props;
  const { t } = useTranslation('Rpb');
  const { isPoppedOut } = usePdfPopout();

  return (
    <Swimlanes.Group
      unfoldOn={isPoppedOut ? 'always' : 'desktop'}
      {...leftPanelTab}
      ariaLabel={t('page.leftGroupAriaLabel')}
    >
      <Swimlanes.Lane
        id={OUTLINE_LANE_ID}
        title={t('gliederung.title')}
        icon={ListOrdered}
      >
        <OutlineSwimlane />
      </Swimlanes.Lane>
      <Swimlanes.Lane
        id={BESCHLUSS_LANE_ID}
        title={t('beschluss.title')}
        icon={Book}
      >
        <BeschlussSwimlane />
      </Swimlanes.Lane>
    </Swimlanes.Group>
  );
};

export const RpbSwimlanes = () => {
  const { t } = useTranslation('Rpb');
  const leftPanelTab = useSwimlanesGroupSearchState(
    rpbLeftPanelTabSearchSchema,
  );
  const { aiLane, rechtsmethodikSatzId } = route.useSearch({
    select: (search) => ({
      aiLane: search.aiLane,
      rechtsmethodikSatzId: search.rechtsmethodikSatzId,
    }),
  });
  const aiLaneTitle =
    aiLane === 'risikohinweise'
      ? t('riskWarnings.laneTitle')
      : rechtsmethodikSatzId
        ? t('aiAssistance.rechtsmethodikTitle')
        : t('aiAssistance.title');

  return (
    <div className="flex h-full min-h-0 w-full flex-1 self-stretch">
      <div className="flex min-h-[var(--reflow-min-h)] w-full min-w-0 flex-1 flex-col overflow-hidden border border-border-primary bg-neutral-white lg:h-full">
        <div className="min-h-[var(--reflow-min-h)] flex-1 overflow-y-auto lg:min-h-0">
          <RpbFeatureProvider>
            <RpbOutlineProvider>
              <Swimlanes className="h-full">
                <Suspense
                  fallback={
                    <LeftPanelGroupSkeleton leftPanelTab={leftPanelTab} />
                  }
                >
                  <LeftPanelGroup leftPanelTab={leftPanelTab} />
                </Suspense>

                <Swimlanes.Lane
                  id="ki"
                  title={aiLaneTitle}
                  variant="ai"
                  icon={Sparkles}
                >
                  <AiAssistanceSwimlane />
                </Swimlanes.Lane>

                <PdfPopoutSwimlane />
              </Swimlanes>
            </RpbOutlineProvider>
          </RpbFeatureProvider>
        </div>
      </div>
    </div>
  );
};
