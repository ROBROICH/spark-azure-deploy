import { SidebarPanelHeader } from '@/features/project/action-sidebar/SidebarPanelHeader';
import { SidebarPanelShell } from '@/features/project/action-sidebar/SidebarPanelShell';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Button } from '@/features/ui/button/Button';
import { toast } from '@/features/ui/toast/Toast';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
// eslint-disable-next-line no-restricted-syntax -- Radix Dialog compound component pattern requires namespace access for Title and Close
import * as SheetPrimitive from '@radix-ui/react-dialog';
import {
  AUDIT_LOG_PAGE_SIZE,
  useAuditLogHistory,
} from './data/useAuditLogHistory';
import { resetAuditLogHistoryCollection } from './data/auditLogHistory.collection';
import { AuditLogDrilldownHeader } from './AuditLogDrilldownHeader';
import { AuditLogEventStream } from './AuditLogEventStream';
import {
  buildAuditLogHistoryQuery,
  getTimeSections,
  groupHistoryItems,
  sortHistoryItemsNewestFirst,
} from './AuditLogHelpers';
import { exportAuditLogHistory } from './AuditLogExport';
import { AuditLogPagination } from './AuditLogPagination';
import { FilterBar } from './FilterBar';

type AuditLogProps = {
  open: boolean;
  onClose: () => void;
  sidebarExpanded: boolean;
};

const route = getRouteApi('/verfahren/$verfahrenId');

type AuditLogDrilldownGroup = {
  id: string;
  type: 'workflow' | 'request';
};

const getActiveDrilldownGroup = (params: {
  protocolRequestId: string | undefined;
  protocolWorkflowRunId: string | undefined;
}): AuditLogDrilldownGroup | null => {
  if (params.protocolWorkflowRunId) {
    return { id: params.protocolWorkflowRunId, type: 'workflow' };
  }

  if (params.protocolRequestId) {
    return { id: params.protocolRequestId, type: 'request' };
  }

  return null;
};

const getSidebarTitle = (
  drilldownGroup: AuditLogDrilldownGroup | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (drilldownGroup?.type === 'workflow') {
    return t('sidebar.drilldownTitle');
  }

  if (drilldownGroup?.type === 'request') {
    return t('sidebar.requestDrilldownTitle');
  }

  return t('sidebar.title', { 0: t('sidebar.projectFallback') });
};

/**
 * Owns route-search coordination for the audit sidebar so child sections stay
 * presentational and parent/drilldown query state stays in one place.
 *
 * @param props Controls sidebar visibility, close behavior, and panel width.
 * @returns The audit log sidebar panel for the active project route.
 */
export const AuditLog = (props: AuditLogProps) => {
  const { open, onClose, sidebarExpanded } = props;
  const {
    protocolTimePeriods,
    protocolSource,
    protocolService,
    protocolWorkflowRunId,
    protocolRequestId,
    protocolOffset,
    protocolDrilldownOffset,
  } = route.useSearch();
  const { verfahrenId } = route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('AuditLog');
  const contentRef = useRef<HTMLDivElement>(null);
  const drilldownGroup = getActiveDrilldownGroup({
    protocolRequestId,
    protocolWorkflowRunId,
  });
  const isDrilldown = Boolean(drilldownGroup);
  // eslint-disable-next-line no-restricted-syntax -- export loading is local button state for one browser download.
  const [isExporting, setIsExporting] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- refresh loading is local button state for one explicit server refetch.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastOpenedGroupKeyRef = useRef<string | null>(null);

  const query = buildAuditLogHistoryQuery({
    protocolOffset: isDrilldown ? protocolDrilldownOffset : protocolOffset,
    protocolRequestId,
    protocolService,
    protocolSource,
    protocolTimePeriods,
    protocolWorkflowRunId,
  });

  const { items, isLoading, isError, metadata } = useAuditLogHistory(
    verfahrenId,
    query,
  );
  const sortedItems = sortHistoryItemsNewestFirst(items);
  const groupedItems = groupHistoryItems(sortedItems, getTimeSections(t));
  const parentItem = sortedItems[0];
  const offset = Number(query.offset ?? 0);
  const loadedItemCount = items.length;
  const sidebarTitle = getSidebarTitle(drilldownGroup, t);
  const isWorkflowExportUnavailable = drilldownGroup?.type === 'workflow';

  // eslint-disable-next-line no-restricted-syntax -- Scroll to top when the backend-backed stream changes view/page.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [
    protocolWorkflowRunId,
    protocolRequestId,
    protocolOffset,
    protocolDrilldownOffset,
    protocolTimePeriods,
    protocolSource,
    protocolService,
  ]);

  /**
   * Keeps parent-list and drilldown offsets isolated so closing a drilldown
   * preserves the page the user opened it from.
   *
   * @param nextOffset Zero-based offset for the currently visible audit list.
   * @returns Nothing.
   */
  const updateOffset = (nextOffset: number) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        protocolDrilldownOffset: isDrilldown
          ? nextOffset === 0
            ? undefined
            : nextOffset
          : prev.protocolDrilldownOffset,
        protocolOffset: !isDrilldown
          ? nextOffset === 0
            ? undefined
            : nextOffset
          : prev.protocolOffset,
      }),
      resetScroll: false,
      replace: true,
    });
  };

  const handleGroupLinkClick = (groupKey: string) => {
    lastOpenedGroupKeyRef.current = groupKey;
  };

  const closeDrilldown = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        protocolWorkflowRunId: undefined,
        protocolRequestId: undefined,
        protocolDrilldownOffset: undefined,
      }),
      resetScroll: false,
    });
  };

  // eslint-disable-next-line no-restricted-syntax -- focus returns to the group link after closing drilldown because the link is recreated from URL state.
  useEffect(() => {
    if (isDrilldown || !lastOpenedGroupKeyRef.current) {
      return;
    }

    const groupKey = lastOpenedGroupKeyRef.current;
    lastOpenedGroupKeyRef.current = null;
    window.setTimeout(() => {
      const selector = `[data-audit-log-group-link="${CSS.escape(groupKey)}"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  }, [isDrilldown]);

  const handleExport = () => {
    if (isWorkflowExportUnavailable) {
      toast.error(t('export.workflowUnavailable'));
      return;
    }

    setIsExporting(true);
    return exportAuditLogHistory(verfahrenId, query).then(
      () => {
        setIsExporting(false);
      },
      () => {
        toast.error(t('export.error'));
        setIsExporting(false);
      },
    );
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    return resetAuditLogHistoryCollection(verfahrenId, query).then(
      () => {
        setIsRefreshing(false);
      },
      (error: unknown) => {
        setIsRefreshing(false);
        throw error;
      },
    );
  };

  return (
    <SidebarPanelShell
      open={open}
      onClose={onClose}
      sidebarExpanded={sidebarExpanded}
      className={
        sidebarExpanded
          ? 'w-full sm:w-[min(72rem,calc(100vw-19rem))]'
          : 'w-full sm:w-[min(72rem,calc(100vw-5rem))]'
      }
      modal
    >
      <SidebarPanelHeader
        title={sidebarTitle}
        titleWrapper={SheetPrimitive.Title}
      >
        <Button
          variant="ghost"
          size="default"
          iconOnly
          loading={isExporting}
          disabled={isExporting}
          aria-disabled={isWorkflowExportUnavailable}
          aria-label={
            isWorkflowExportUnavailable
              ? t('export.workflowUnavailable')
              : t('filterBar.download')
          }
          className={
            isWorkflowExportUnavailable
              ? 'cursor-not-allowed text-neutral-400 hover:bg-transparent hover:text-neutral-400 active:bg-transparent active:text-neutral-400'
              : undefined
          }
          onClick={() => {
            void handleExport();
          }}
        >
          <Download className="size-4" />
        </Button>
        <TooltipWrapper
          content={t('refresh.tooltip')}
          side="bottom"
          align="end"
        >
          <Button
            variant="ghost"
            size="default"
            iconOnly
            loading={isRefreshing}
            disabled={isLoading || isRefreshing}
            aria-label={t('refresh.label')}
            onClick={() => {
              void handleRefresh();
            }}
          >
            <RefreshCw className="size-4" />
          </Button>
        </TooltipWrapper>
        <SheetPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="default"
            iconOnly
            aria-label={t('sidebar.close')}
          >
            <X className="size-4" />
          </Button>
        </SheetPrimitive.Close>
      </SidebarPanelHeader>

      <div
        ref={contentRef}
        className="flex flex-1 flex-col overflow-y-auto bg-white p-6"
      >
        {!isDrilldown ? <FilterBar /> : null}

        {drilldownGroup ? (
          <AuditLogDrilldownHeader
            item={parentItem}
            total={metadata?.total ?? loadedItemCount}
            group={drilldownGroup}
            onBack={closeDrilldown}
          />
        ) : null}

        <AuditLogEventStream
          groupedItems={groupedItems}
          isDrilldown={isDrilldown}
          isError={isError}
          isLoading={isLoading}
          onOpenGroupLinkClick={handleGroupLinkClick}
          onRetry={() => {
            void handleRefresh();
          }}
        />

        <AuditLogPagination
          isLoading={isLoading}
          limit={metadata?.limit ?? AUDIT_LOG_PAGE_SIZE}
          loadedItemCount={loadedItemCount}
          offset={metadata?.offset ?? offset}
          total={metadata?.total}
          onOffsetChange={updateOffset}
        />
      </div>
    </SidebarPanelShell>
  );
};
