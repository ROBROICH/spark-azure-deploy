import { describe, expect, it } from 'vitest';
import { resolveEwmsViewState } from './ewmsWorkflowStatus';

describe('resolveEwmsViewState', () => {
  it('shows the landing page when no EWMS workflow has run', () => {
    expect(
      resolveEwmsViewState({
        hasFirstSwimlaneData: false,
        isWorkflowRunning: false,
      }),
    ).toBe('landing');
  });

  it('shows the processing page for the first running EWMS workflow', () => {
    expect(
      resolveEwmsViewState({
        hasFirstSwimlaneData: false,
        isWorkflowRunning: true,
      }),
    ).toBe('processing');
  });

  it('shows the workspace for a running EWMS workflow once first-lane data exists', () => {
    expect(
      resolveEwmsViewState({
        hasFirstSwimlaneData: true,
        isWorkflowRunning: true,
      }),
    ).toBe('workspace');
  });

  it('shows the workspace when first-lane EWMS data exists and no workflow is running', () => {
    expect(
      resolveEwmsViewState({
        hasFirstSwimlaneData: true,
        isWorkflowRunning: false,
      }),
    ).toBe('workspace');
  });

  it('does not show the workspace without first-lane data', () => {
    expect(
      resolveEwmsViewState({
        hasFirstSwimlaneData: false,
        isWorkflowRunning: false,
      }),
    ).toBe('landing');
  });
});
