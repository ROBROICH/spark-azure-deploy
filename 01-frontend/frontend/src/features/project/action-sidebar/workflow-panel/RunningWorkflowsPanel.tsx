import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { Button } from '@/features/ui/button/Button';
import { getDateLocale } from '@/i18n/dateLocale';
import {
  Close as SheetClose,
  Title as SheetTitle,
} from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRouteApi } from '@tanstack/react-router';
import { useWorkflowHistory } from '@/features/workflow-runtime/workflow-status/useWorkflowHistory';
import { getLatestWorkflowsByType } from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';
import { RunningWorkflowCard } from './RunningWorkflowCard';
import { RunningWorkflowsIcon } from './RunningWorkflowsIcon';
import { SidebarPanelHeader } from '../SidebarPanelHeader';
import { SidebarPanelShell } from '../SidebarPanelShell';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

type RunningWorkflowsPanelProps = {
  open: boolean;
  onClose: () => void;
  sidebarExpanded: boolean;
};

const WorkflowCardSkeleton = () => {
  return (
    <div className="rounded-lg border border-border-primary bg-neutral-white p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
    </div>
  );
};

/**
 * History is loaded only for an open drawer; displayed groups may still be partial.
 * @param props - Drawer visibility and surrounding sidebar state.
 * @returns Loaded workflow groups with explicit continuation and error feedback.
 */
export const RunningWorkflowsPanel = (props: RunningWorkflowsPanelProps) => {
  const { open, onClose, sidebarExpanded } = props;
  const { t, i18n } = useTranslation('Project');
  const { verfahrenId } = projectRoute.useParams();
  const { projectVersion } = projectRoute.useLoaderData();
  const history = useWorkflowHistory(verfahrenId, projectVersion, open);
  const { isError, isPending: isLoading } = history;
  const workflows = [
    ...new Map(
      (history.data?.pages.flatMap((page) => page.workflows) ?? []).map(
        (workflow) => [`${workflow.workflowId}:${workflow.runId}`, workflow],
      ),
    ).values(),
  ];
  const latestWorkflowsByType = getLatestWorkflowsByType(workflows);
  // eslint-disable-next-line no-restricted-syntax -- expanded workflow cards are ephemeral drawer UI state.
  const [expandedWorkflowRunKey, setExpandedWorkflowRunKey] = useState<
    string | null
  >(null);
  // eslint-disable-next-line no-restricted-syntax -- displayed workflow durations need a local timer tick while the drawer is mounted.
  const [now, setNow] = useState(() => Date.now());
  const contentRef = useRef<HTMLDivElement>(null);
  const dateLocale = getDateLocale(i18n.resolvedLanguage);
  const hasRunningWorkflow = latestWorkflowsByType.some(
    (workflowSummary) => workflowSummary.isRunning,
  );
  const showSkeleton = isLoading && latestWorkflowsByType.length === 0;

  // eslint-disable-next-line no-restricted-syntax -- Scroll to top when the workflow drawer mounts so the newest items are immediately visible.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- A one-second interval keeps running workflow durations current while the drawer stays open.
  useEffect(() => {
    if (!hasRunningWorkflow) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasRunningWorkflow]);

  return (
    <SidebarPanelShell
      open={open}
      onClose={onClose}
      sidebarExpanded={sidebarExpanded}
      className="bg-neutral-white"
    >
      <SidebarPanelHeader
        icon={RunningWorkflowsIcon}
        title={t('Sidebar.runningWorkflowsPanel.title')}
        titleWrapper={SheetTitle}
      >
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="default"
            iconOnly
            aria-label={t('Sidebar.runningWorkflowsPanel.close')}
          >
            <X className="size-4" />
          </Button>
        </SheetClose>
      </SidebarPanelHeader>

      <div
        ref={contentRef}
        className="flex h-0 min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        {showSkeleton && (
          <>
            <WorkflowCardSkeleton />
            <WorkflowCardSkeleton />
            <WorkflowCardSkeleton />
          </>
        )}

        {!showSkeleton && isError && (
          <div className="rounded-lg border border-border-primary bg-neutral-white p-4">
            <p className="text-sm text-text-secondary">
              {t('Sidebar.runningWorkflowsPanel.error')}
            </p>
          </div>
        )}

        {!showSkeleton && !isError && latestWorkflowsByType.length === 0 && (
          <div className="rounded-lg border border-border-primary bg-neutral-white p-4">
            <p className="text-sm text-text-secondary">
              {t('Sidebar.runningWorkflowsPanel.emptyState')}
            </p>
          </div>
        )}

        {history.hasNextPage && (
          <p className="text-xs text-text-secondary">
            {t('Sidebar.runningWorkflowsPanel.partialHistory')}
          </p>
        )}

        {!showSkeleton &&
          latestWorkflowsByType.map((workflowSummary) => {
            const workflowTypeKey = workflowSummary.workflowTypeKey;

            return (
              <RunningWorkflowCard
                key={workflowTypeKey}
                workflowSummary={workflowSummary}
                dateLocale={dateLocale}
                now={now}
                isExpanded={expandedWorkflowRunKey === workflowTypeKey}
                onExpandedChange={(isExpanded) =>
                  setExpandedWorkflowRunKey(isExpanded ? workflowTypeKey : null)
                }
              />
            );
          })}
        {history.hasNextPage && (
          <Button
            type="button"
            variant="ghost"
            size="default"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {t('Sidebar.runningWorkflowsPanel.loadMoreRuns')}
          </Button>
        )}
      </div>
    </SidebarPanelShell>
  );
};
