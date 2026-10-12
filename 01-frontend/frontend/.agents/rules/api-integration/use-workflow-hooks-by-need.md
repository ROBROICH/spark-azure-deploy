---
ruleId: api-integration/use-workflow-hooks-by-need
paths:
  - "src/features/workflow-runtime/**"
  - "src/features/**/*.ts"
  - "src/features/**/*.tsx"
---

# Use Workflow Hooks By Need

- Use `useRunningWorkflow` when a feature only needs an active-job signal, the current matching running workflow, optimistic running state after `start(...)`, or button/progress visibility. Do not read workflow history just to answer “is something running?”.
- Use `useWorkflow` only when the feature needs historical workflow data such as `hasAnyRun`, `hasSuccessfulRun`, `latestWorkflow`, `latestWorkflowsByType`, or child workflow history.
- `useWorkflow` refreshes history from the running-workflow signal; do not add component-level polling, remount hooks, or a `historyRefetchMode` option around it.
- When multiple route descendants need the same workflow history, create one route/feature owner or context that calls `useWorkflow` once and derive child states with `getSubWorkflowStateFromWorkflowState(...)`.
- After starting a workflow, call the `observeStarted` function returned by `useRunningWorkflow` with the backend `parentJobId` so the running collection updates immediately.

## Bad Example

```tsx
const matching = useWorkflow({
  workflowType: WORKFLOW_TYPE_RISIKOHINWEISE,
});

return (
  <AiButton loading={matching.isRunning || matching.isLoading} />
);
```

```tsx
const toc = useSubWorkflow({
  workflowType: WORKFLOW_TYPE_FVP,
  subWorkflowType: WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
});
const documents = useSubWorkflow({
  workflowType: WORKFLOW_TYPE_FVP,
  subWorkflowType: WORKFLOW_TYPE_LLM_MATCHING,
});
const plausibility = useSubWorkflow({
  workflowType: WORKFLOW_TYPE_FVP,
  subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
});
```

## Good Example

```tsx
const { isRunning, latestRunningWorkflow, observeStarted } = useRunningWorkflow({
  workflowType: WORKFLOW_TYPE_RISIKOHINWEISE,
});

return (
  <AiButton
    loading={isRunning}
    progressStartedAt={latestRunningWorkflow?.workflow_start_time}
    onStarted={(workflow) => observeStarted(workflow.parentJobId)}
  />
);
```

```tsx
const workflowState = useWorkflow({
  workflowType: WORKFLOW_TYPE_FVP,
  includeSubWorkflows: true,
  refetchNodeSummariesOnSuccess: false,
});

const toc = getSubWorkflowStateFromWorkflowState({
  workflowState,
  subWorkflowType: WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
});
const documents = getSubWorkflowStateFromWorkflowState({
  workflowState,
  subWorkflowType: WORKFLOW_TYPE_LLM_MATCHING,
});
const plausibility = getSubWorkflowStateFromWorkflowState({
  workflowState,
  subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
});
```
