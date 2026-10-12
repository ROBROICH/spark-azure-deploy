import { client } from '@/api-clients/backend/client.gen';
import type {
  V1FormalCompletenessGetFormalDocumentSummaryResponse,
  V1FormalCompletenessGetRequiredDocumentTypesResponse,
  V1FormalCompletenessGetTocNotesResponse,
  V1PlausibilityNotesGetPlausibilityNotesResponse,
  V1SupplementaryRequestsGetSupplementaryRequestSourcesResponse,
  V1TemporalJobsListTemporalWorkflowsByTypeResponse,
  WorkflowsBase,
} from '@/api-clients/backend/types.gen';
import { useFvpAiWorkflowState } from '@/features/project/fvp/main-screen/useFvpAiWorkflowState';
import { FvpWorkflowProvider } from '@/features/workflow-runtime/workflow-status/FvpWorkflowContext';
import { getProjectTemporalWorkflowsManager } from '@/features/workflow-runtime/workflow-status/projectTemporalWorkflows.collection';
import {
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAnalysisSection } from './AiAnalysisSection';

const scope = vi.hoisted(() => ({
  projectId: '62000000-0000-4000-8000-000000000185',
  projectVersion: 2,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: scope.projectId }),
    useLoaderData: (options?: {
      select?: (data: { projectVersion: number }) => unknown;
    }) => {
      const data = {
        projectVersion: scope.projectVersion,
        workflowsManager: getProjectTemporalWorkflowsManager(
          scope.projectId,
          scope.projectVersion,
        ),
      };
      return options?.select ? options.select(data) : data;
    },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { projectId, projectVersion } = scope;

// The summary the workflow read returns after the backend case "a failed
// formal-completeness delivery names that branch and the unstarted
// plausibility" (agent_orchestration_service/test/fvp-workflow-failure.test.ts):
// an incremental version-2 run with a still-valid table-of-contents document,
// so it starts no table-of-contents matching. LLM matching completed, then
// delivering its result failed.
const failedFvpRun = {
  workflowId: `FVPWorkflow-${projectId}-v${projectVersion}`,
  runId: '62000000-0000-4000-8000-000000000186',
  projectId,
  projectVersion,
  workflowType: 'FVPWorkflow',
  status: 'failed',
  workflowStartTime: '2026-09-01T08:00:00Z',
  workflowCloseTime: '2026-09-01T08:42:00Z',
  failure: {
    errorCode: 'ANALYSIS_FAILED',
    branches: [
      { branch: 'formalpruefung', errorCode: 'ANALYSIS_FAILED' },
      { branch: 'plausibilitaetspruefung', errorCode: 'ANALYSIS_FAILED' },
    ],
  },
} satisfies WorkflowsBase;

const completedStageRuns: WorkflowsBase[] = [
  {
    workflowId: '62000000-0000-4000-8000-000000000187',
    runId: '62000000-0000-4000-8000-000000000188',
    projectId,
    projectVersion,
    workflowType: 'LLMMatchingWorkflow',
    status: 'completed',
    workflowStartTime: '2026-09-01T08:05:00Z',
    workflowCloseTime: '2026-09-01T08:30:00Z',
    failure: null,
  },
];

const replyWithWorkflowSummaries = (query: URLSearchParams): Response => {
  const isStageRead = query.has('rootWorkflowId') || query.has('rootRunId');
  const isFailedRunStageRead =
    query.get('rootWorkflowId') === failedFvpRun.workflowId &&
    query.get('rootRunId') === failedFvpRun.runId;
  // A stage read for another run or version fails, so the parent failure
  // stays unassigned and no card is marked.
  if (
    query.get('projectVersion') !== String(projectVersion) ||
    (isStageRead && !isFailedRunStageRead)
  ) {
    return Response.json(
      { message: 'Unexpected workflow read' },
      { status: 400 },
    );
  }
  const workflowType = query.get('workflowType') ?? '';
  const executionStatus = query.get('executionStatus') ?? 'all';
  const workflowId = query.get('workflowId');
  const runs: WorkflowsBase[] = isStageRead
    ? completedStageRuns
    : [failedFvpRun];
  const workflows = runs.filter(
    (run) =>
      run.workflowType === workflowType &&
      (workflowId === null || run.workflowId === workflowId) &&
      (executionStatus === 'all' ||
        run.status === executionStatus.toLowerCase()),
  );

  return Response.json({
    projectId,
    workflowType,
    retrievedWorkflows: workflows.length,
    workflows,
    nextPageToken: null,
  } satisfies V1TemporalJobsListTemporalWorkflowsByTypeResponse);
};

// Formal completeness and plausibility persisted no result: the delivery
// failed and plausibility never started. An earlier run delivered the table
// of contents, but its read stays empty because the table-of-contents result
// card needs the current-user and project providers, outside this read path.
const resultReads: Record<string, unknown> = {
  [`/api/fcs/v1/${projectId}/toc-notes`]: {
    status: null,
    notes: [],
  } satisfies V1FormalCompletenessGetTocNotesResponse,
  [`/api/fcs/v1/${projectId}/required-document-types`]: {
    categories: [],
  } satisfies V1FormalCompletenessGetRequiredDocumentTypesResponse,
  [`/api/fcs/v1/${projectId}/document-summary`]: {
    assignedTypeIds: [],
  } satisfies V1FormalCompletenessGetFormalDocumentSummaryResponse,
  [`/api/plausibility-notes/v1/plausibility-notes/${projectId}`]: {
    contradictions: [],
  } satisfies V1PlausibilityNotesGetPlausibilityNotesResponse,
  [`/api/supplementary-requests/v1/projects/${projectId}/supplementary-requests/sources`]:
    [] satisfies V1SupplementaryRequestsGetSupplementaryRequestSourcesResponse,
};

const originalClient = client.getConfig();
const originalDefaults = queryClient.getDefaultOptions();

const FvpAnalysisCards = () => {
  const workflow = useFvpAiWorkflowState(projectId);

  return (
    <AiAnalysisSection
      projectId={projectId}
      workflow={workflow}
      onStartClick={() => undefined}
    />
  );
};

beforeEach(() => {
  queryClient.setDefaultOptions({
    ...originalDefaults,
    queries: { ...originalDefaults.queries, retry: false },
  });
  client.setConfig({
    baseUrl: 'http://spark-workflow.test',
    fetch: (request) => {
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      if (url.pathname === `/api/temporal/workflows/by-type/${projectId}`) {
        return Promise.resolve(replyWithWorkflowSummaries(url.searchParams));
      }
      const body = resultReads[url.pathname];
      // Start gates such as system load and project files are out of scope.
      return Promise.resolve(
        body === undefined
          ? Response.json({ message: 'Not found' }, { status: 404 })
          : Response.json(body),
      );
    },
  });
});

afterEach(async () => {
  cleanup();
  const manager = getProjectTemporalWorkflowsManager(projectId, projectVersion);
  await Promise.all([
    manager.getCollection({ workflowType: WORKFLOW_TYPE_FVP }).cleanup(),
    ...[
      WORKFLOW_TYPE_FVP,
      WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
      WORKFLOW_TYPE_LLM_MATCHING,
      WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
    ].map((workflowType) =>
      manager
        .getCollection({ workflowType, executionStatus: 'Running' })
        .cleanup(),
    ),
  ]);
  queryClient.clear();
  queryClient.setDefaultOptions(originalDefaults);
  client.setConfig({
    ...originalClient,
    baseUrl: originalClient.baseUrl,
    fetch: originalClient.fetch,
  });
});

describe('FVP analysis cards for a failed FVPWorkflow summary', () => {
  it('marks the cards of the branches the summary names and leaves the table of contents unmarked', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <FvpWorkflowProvider>
          <FvpAnalysisCards />
        </FvpWorkflowProvider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('button', {
        name: 'processingFailure.areas.requiredDocuments',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'processingFailure.areas.plausibility',
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: 'processingFailure.areas.tableOfContents',
      }),
    ).toBeNull();
  });
});
