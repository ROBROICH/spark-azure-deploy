import { v1TemporalJobsGetTemporalWorkflowExecutionTree } from '@/api-clients/backend';
import type { TemporalJobExecutionTree } from '@/api-clients/backend/types.gen';
import { Button } from '@/features/ui/button/Button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/**
 * Each expanded run owns its history cursor; event IDs join later lifecycle updates.
 * Child and continued runs remain unloaded until their sections are expanded.
 * @param props - Exact workflow and run identity for this tree section.
 * @returns A partial or complete history section with explicit continuation controls.
 */
export const WorkflowExecutionTree = (props: {
  workflowId: string;
  runId: string;
}) => {
  const { workflowId, runId } = props;
  const { t } = useTranslation('Project');
  const history = useInfiniteQuery({
    queryKey: ['temporal-execution-tree', workflowId, runId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await v1TemporalJobsGetTemporalWorkflowExecutionTree({
        path: { workflowId },
        query: { runId, pageSize: 100, nextPageToken: pageParam },
        throwOnError: true,
      });
      return data;
    },
    getNextPageParam: (page) => page.nextPageToken ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages[0]?.status === 'running' ? 30_000 : false,
  });
  const nodes = new Map<number, TemporalJobExecutionTree['children'][number]>();
  for (const page of history.data?.pages ?? []) {
    for (const update of page.children) {
      const previous = nodes.get(update.eventId);
      nodes.set(update.eventId, {
        ...update,
        id: update.id ?? previous?.id ?? null,
        name: update.name ?? previous?.name ?? null,
        runId: update.runId ?? previous?.runId ?? null,
      });
    }
  }
  const lastPage = history.data?.pages.at(-1);
  return (
    <div className="flex flex-col gap-2 border-l border-border-primary pl-3">
      {history.isPending && (
        <p role="status">{t('Sidebar.runningWorkflowsPanel.loadingHistory')}</p>
      )}
      {history.isError && (
        <p role="alert">{t('Sidebar.runningWorkflowsPanel.error')}</p>
      )}
      {[...nodes.values()].map((node) => (
        <Collapsible key={node.eventId}>
          {node.type === 'workflow' &&
          node.id !== null &&
          node.runId !== null ? (
            <>
              <CollapsibleTrigger className="focus-ring text-left text-xs text-text-primary">
                {node.name ?? node.id} · {node.status}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <WorkflowExecutionTree
                  workflowId={node.id}
                  runId={node.runId}
                />
              </CollapsibleContent>
            </>
          ) : (
            <p className="text-xs text-text-primary">
              {node.name ?? node.id ?? `#${node.eventId}`} · {node.status}
            </p>
          )}
          {node.error !== null && (
            <p className="text-xs text-text-secondary">{node.error}</p>
          )}
        </Collapsible>
      ))}
      {history.hasNextPage && (
        <>
          <p className="text-xs text-text-secondary">
            {t('Sidebar.runningWorkflowsPanel.partialRunHistory')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {t('Sidebar.runningWorkflowsPanel.loadMoreEvents')}
          </Button>
        </>
      )}
      {lastPage?.historyComplete && (
        <p className="text-xs text-text-secondary">
          {t('Sidebar.runningWorkflowsPanel.historySnapshotComplete')}
        </p>
      )}
      {lastPage?.continuedAsNewRunId && (
        <Collapsible>
          <CollapsibleTrigger className="focus-ring text-left text-xs">
            {t('Sidebar.runningWorkflowsPanel.openContinuedRun')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <WorkflowExecutionTree
              workflowId={workflowId}
              runId={lastPage.continuedAsNewRunId}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
