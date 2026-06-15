import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionSidebarPanel } from './ActionSidebarPanel';

vi.mock('@/features/project/audit-log/AuditLog', () => ({
  AuditLog: () => <section aria-label="audit-log" />,
}));

vi.mock('../comments/sidebar-panel/CommentsPanel', () => ({
  CommentsPanel: () => <section aria-label="comments" />,
}));

vi.mock('../nachforderungen/sidebar-panel/RequestList', () => ({
  RequestList: () => <section aria-label="request-list" />,
}));

vi.mock('./ActionSidebarPlaceholder', () => ({
  ActionSidebarPlaceholder: () => <section aria-label="placeholder" />,
}));

vi.mock('./workflow-panel/RunningWorkflowsPanel', () => ({
  RunningWorkflowsPanel: () => <section aria-label="running-workflows" />,
}));

afterEach(() => cleanup());

describe('ActionSidebarPanel', () => {
  it('can close an active panel without changing the parent hook order', () => {
    const { rerender } = render(
      <ActionSidebarPanel
        activePanel="requestList"
        isDevMode={false}
        isExpanded={false}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'request-list' }),
    ).toBeInTheDocument();

    rerender(
      <ActionSidebarPanel
        activePanel={null}
        isDevMode={false}
        isExpanded={false}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('region', { name: 'request-list' }),
    ).not.toBeInTheDocument();
  });
});
