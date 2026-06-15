import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_EWMS,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_LLM_MATCHING,
} from '@/features/workflow-runtime/workflow-status/workflowStatus.helpers';
import {
  getTemporalWorkflowTimelineUrl,
  getWorkflowNameLabelKey,
} from './workflowCardDisplay';

const UNKNOWN_LABEL_KEY = 'Sidebar.runningWorkflowsPanel.unknownWorkflowType';
const TEMPORAL_UI_BASE_URL_ENV_KEY = 'VITE_TEMPORAL_UI_BASE_URL';

const makeWorkflow = (workflowType: string): WorkflowsBase => ({
  workflow_id: 'wf-1',
  run_id: 'run-1',
  workflow_type: workflowType,
});

afterEach(() => {
  window.__APP_CONFIG__ = undefined;
  vi.unstubAllEnvs();
});

describe('getWorkflowNameLabelKey', () => {
  it('resolves the product name key for mixed-case Temporal types', () => {
    // Regression: the lookup normalizes (lowercases) the workflow type, so the
    // label map must be keyed by normalized values. Before the fix, mixed-case
    // types like `FVPWorkflow` fell through to the generic fallback.
    expect(getWorkflowNameLabelKey(makeWorkflow(WORKFLOW_TYPE_FVP))).toBe(
      'Sidebar.runningWorkflowsPanel.workflowNames.fvp',
    );
    expect(
      getWorkflowNameLabelKey(makeWorkflow(WORKFLOW_TYPE_LLM_MATCHING)),
    ).toBe('Sidebar.runningWorkflowsPanel.workflowNames.documentMatching');
    expect(getWorkflowNameLabelKey(makeWorkflow(WORKFLOW_TYPE_EWMS))).toBe(
      'Sidebar.runningWorkflowsPanel.workflowNames.ewmsExport',
    );
  });

  it('resolves the product name key for already-lowercase types', () => {
    expect(getWorkflowNameLabelKey(makeWorkflow(WORKFLOW_TYPE_BEWERTUNG))).toBe(
      'Sidebar.runningWorkflowsPanel.workflowNames.assessment',
    );
  });

  it('matches regardless of casing supplied by the backend', () => {
    expect(getWorkflowNameLabelKey(makeWorkflow('fvpworkflow'))).toBe(
      'Sidebar.runningWorkflowsPanel.workflowNames.fvp',
    );
  });

  it('falls back to the unknown-workflow key for unmapped types', () => {
    expect(getWorkflowNameLabelKey(makeWorkflow('SomeUnmappedWorkflow'))).toBe(
      UNKNOWN_LABEL_KEY,
    );
  });
});

describe('getTemporalWorkflowTimelineUrl', () => {
  it('builds a Temporal UI URL with encoded workflow and run ids', () => {
    window.__APP_CONFIG__ = {
      VITE_TEMPORAL_UI_BASE_URL:
        'https://temporal.example.test/namespaces/default/workflows/',
    };

    expect(
      getTemporalWorkflowTimelineUrl({
        ...makeWorkflow(WORKFLOW_TYPE_FVP),
        workflow_id: 'workflow/with spaces',
        run_id: 'run#1',
      }),
    ).toBe(
      'https://temporal.example.test/namespaces/default/workflows/workflow%2Fwith%20spaces/run%231',
    );
  });

  it('throws when no Temporal UI base URL is configured', () => {
    vi.stubEnv(TEMPORAL_UI_BASE_URL_ENV_KEY, '');

    expect(() =>
      getTemporalWorkflowTimelineUrl(makeWorkflow(WORKFLOW_TYPE_FVP)),
    ).toThrow('VITE_TEMPORAL_UI_BASE_URL is required');
  });
});
