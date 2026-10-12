import { redirectExcludedStepToEwms } from '@/features/project/route/productModeRedirect';
import { ProjectNavbar } from '@/features/project/route-navbar/ProjectNavbar';
import { ProjectNavbarSkeleton } from '@/features/project/route-navbar/ProjectNavbarSkeleton';
import {
  FvpWorkflowProvider,
  useFvpWorkflowContext,
} from '@/features/workflow-runtime/workflow-status/FvpWorkflowContext';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense, useEffect, useRef } from 'react';

const INVALIDATION_RETRY_DELAY_MS = 1_500;
const ACTIVE_LOADING_REFRESH_INTERVAL_MS = 5_000;

export const Route = createFileRoute('/verfahren/$verfahrenId/fvp')({
  beforeLoad: ({ params }) => {
    redirectExcludedStepToEwms(params.verfahrenId);
  },
  component: FvpLayout,
});

/**
 * Layout for Formal Completeness Check and Plausibility tabs.
 *
 * This route is the place where the two workflow-related layers are connected:
 *
 * - `FvpWorkflowProvider` tracks the FVP child workflow groups that drive
 *   query invalidation for LLM matching, TOC, and plausibility payloads.
 * - `useTocData(projectId)`, `useFcsData(projectId)`, and `usePpData(projectId)`
 *   are the UI-facing category hooks. Each combines its persisted payload with
 *   its matching child workflow state.
 *
 * In short:
 * - child-workflow status is derived here for invalidation effects
 * - banner/data consumers read the category hooks directly
 */
function FvpLayout() {
  return (
    <FvpWorkflowProvider>
      <FvpLayoutContent />
    </FvpWorkflowProvider>
  );
}

/**
 * Renders FVP tabs and keeps workflow-driven queries fresh while upstream
 * workflows are still running.
 *
 */
function FvpLayoutContent() {
  const { verfahrenId } = Route.useParams();
  const {
    tableOfContentsWorkflow,
    plausibilityWorkflow,
    requiredDocumentsWorkflow,
  } = useFvpWorkflowContext();
  const isLlmMatchingWorkflowLoading = requiredDocumentsWorkflow.isLoading;
  const isTableOfContentsWorkflowLoading = tableOfContentsWorkflow.isLoading;
  const isPlausibilityWorkflowLoading = plausibilityWorkflow.isLoading;
  const previousStatusRef = useRef({
    isLlmMatchingWorkflowLoading,
    isTableOfContentsWorkflowLoading,
    isPlausibilityWorkflowLoading,
  });

  // eslint-disable-next-line no-restricted-syntax -- workflow-status invalidation depends on subscription-style effects.
  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    const timeoutIds: number[] = [];

    const refreshLlmMatchingData =
      previousStatus.isLlmMatchingWorkflowLoading &&
      !isLlmMatchingWorkflowLoading;
    const refreshTocData =
      previousStatus.isTableOfContentsWorkflowLoading &&
      !isTableOfContentsWorkflowLoading;
    const refreshPlausibilityData =
      previousStatus.isPlausibilityWorkflowLoading &&
      !isPlausibilityWorkflowLoading;

    const invalidateWithRetry = (queryKeys: string[][]) => {
      const invalidate = () => {
        void Promise.all(
          queryKeys.map((queryKey) =>
            queryClient.invalidateQueries({
              queryKey: [...queryKey, verfahrenId],
            }),
          ),
        );
      };

      invalidate();

      const timeoutId = window.setTimeout(() => {
        invalidate();
      }, INVALIDATION_RETRY_DELAY_MS);

      timeoutIds.push(timeoutId);
    };

    if (refreshLlmMatchingData) {
      invalidateWithRetry([
        ['required-documents'],
        ['formal-documents'],
        ['formal-document-summary'],
      ]);
    }

    if (refreshTocData) {
      invalidateWithRetry([['toc-notes']]);
    }

    if (refreshPlausibilityData) {
      invalidateWithRetry([['pp-contradictions']]);
    }

    previousStatusRef.current = {
      isLlmMatchingWorkflowLoading,
      isTableOfContentsWorkflowLoading,
      isPlausibilityWorkflowLoading,
    };

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    isLlmMatchingWorkflowLoading,
    isPlausibilityWorkflowLoading,
    isTableOfContentsWorkflowLoading,
    verfahrenId,
  ]);

  // eslint-disable-next-line no-restricted-syntax -- workflow-backed FCS/TOC payloads need periodic query invalidation while their upstream jobs are still running.
  useEffect(() => {
    const queryKeys: string[][] = [];

    if (isLlmMatchingWorkflowLoading) {
      queryKeys.push(
        ['required-documents'],
        ['formal-documents'],
        ['formal-document-summary'],
      );
    }

    if (isTableOfContentsWorkflowLoading) {
      queryKeys.push(['toc-notes'], ['toc-notes-response']);
    }

    if (isPlausibilityWorkflowLoading) {
      queryKeys.push(['pp-contradictions']);
    }

    if (queryKeys.length === 0) {
      return;
    }

    const invalidate = () => {
      void Promise.all(
        queryKeys.map((queryKey) =>
          queryClient.invalidateQueries({
            queryKey: [...queryKey, verfahrenId],
          }),
        ),
      );
    };

    invalidate();

    const intervalId = window.setInterval(() => {
      invalidate();
    }, ACTIVE_LOADING_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    isLlmMatchingWorkflowLoading,
    isPlausibilityWorkflowLoading,
    isTableOfContentsWorkflowLoading,
    verfahrenId,
  ]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-clip">
      <Suspense fallback={<ProjectNavbarSkeleton />}>
        <ProjectNavbar selectedStep="fvp" />
      </Suspense>
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
