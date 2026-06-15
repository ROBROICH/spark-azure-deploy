import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from './AuditLog';

type AuditLogSearchState = {
  protocolDrilldownOffset?: number;
  protocolOffset?: number;
  protocolRequestId?: string;
  protocolService?: string;
  protocolSource?: 'agent' | 'all' | 'user';
  protocolTimePeriods?: string;
  protocolWorkflowRunId?: string;
};

const mocks = vi.hoisted(() => ({
  exportAuditLogHistory: vi.fn(),
  getAuditLogHistoryItemKey: vi.fn(() => 'history-item-1'),
  navigate: vi.fn(),
  resetAuditLogHistoryCollection: vi.fn(),
  routeSearch: {} as AuditLogSearchState,
  toastError: vi.fn(),
  useAuditLogHistory: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
    useSearch: () => mocks.routeSearch,
  }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Close: ({ children }: { children: ReactNode }) => <>{children}</>,
  Title: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/features/project/action-sidebar/SidebarPanelShell', () => ({
  SidebarPanelShell: (props: { children: ReactNode; open: boolean }) =>
    props.open ? <section role="dialog">{props.children}</section> : null,
}));

vi.mock('@/features/project/action-sidebar/SidebarPanelHeader', () => ({
  SidebarPanelHeader: (props: { children?: ReactNode; title: string }) => (
    <header>
      <h2>{props.title}</h2>
      {props.children}
    </header>
  ),
}));

vi.mock('@/features/ui/tooltip/TooltipWrapper', () => ({
  TooltipWrapper: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('./data/useAuditLogHistory', () => ({
  AUDIT_LOG_PAGE_SIZE: 50,
  useAuditLogHistory: mocks.useAuditLogHistory,
}));

vi.mock('./data/auditLogHistory.collection', () => ({
  getAuditLogHistoryItemKey: mocks.getAuditLogHistoryItemKey,
  resetAuditLogHistoryCollection: mocks.resetAuditLogHistoryCollection,
}));

vi.mock('./AuditLogExport', () => ({
  exportAuditLogHistory: mocks.exportAuditLogHistory,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'drilldown.back': 'Back',
        'drilldown.changeCount': `${String(params?.count ?? 0)} changes`,
        'drilldown.request': 'Request',
        'drilldown.workflow': 'Workflow',
        'export.workflowUnavailable': 'Workflow details cannot be downloaded.',
        'filterBar.download': 'Download audit log',
        'pagination.label': 'Audit log pagination',
        'pagination.loaded': `${String(params?.count ?? 0)} entries loaded`,
        'pagination.next': 'Next',
        'pagination.nextPage': 'Go to next audit log page',
        'pagination.previous': 'Previous',
        'pagination.previousPage': 'Go to previous audit log page',
        'refresh.label': 'Refresh audit log',
        'refresh.tooltip': 'Reload audit log',
        'sidebar.close': 'Close',
        'sidebar.drilldownTitle': 'Workflow details',
        'sidebar.projectFallback': 'this project',
        'sidebar.requestDrilldownTitle': 'Request details',
        'sidebar.title': 'Audit log for this project',
        'states.empty': 'No audit log entries match this selection.',
        'states.error': 'The audit log could not be loaded.',
        'states.retry': 'Retry',
      };

      return translations[key] ?? key;
    },
  }),
}));

describe('AuditLog', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn();
    mocks.routeSearch = {};
    mocks.useAuditLogHistory.mockReturnValue({
      isError: false,
      isLoading: false,
      items: [],
      metadata: { limit: 50, offset: 0, total: 0 },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps workflow drilldown export unavailable and reports the localized reason', async () => {
    const user = userEvent.setup();
    mocks.routeSearch = {
      protocolWorkflowRunId: 'workflow-run-1',
    };

    render(<AuditLog open onClose={vi.fn()} sidebarExpanded={false} />);

    const exportButton = screen.getByRole('button', {
      name: 'Workflow details cannot be downloaded.',
    });

    expect(exportButton).toHaveAttribute('aria-disabled', 'true');

    await user.click(exportButton);

    expect(mocks.exportAuditLogHistory).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'Workflow details cannot be downloaded.',
    );
  });
});
