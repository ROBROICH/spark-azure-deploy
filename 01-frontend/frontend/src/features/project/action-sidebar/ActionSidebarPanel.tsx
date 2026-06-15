import { AuditLog } from '@/features/project/audit-log/AuditLog';
import { CommentsPanel } from '../comments/sidebar-panel/CommentsPanel';
import { RequestList } from '../nachforderungen/sidebar-panel/RequestList';
import { ActionSidebarPlaceholder } from './ActionSidebarPlaceholder';
import type { SidebarPanel } from './sidebarSearchParams';
import { RunningWorkflowsPanel } from './workflow-panel/RunningWorkflowsPanel';

type ActionSidebarPanelProps = {
  activePanel: SidebarPanel | null;
  isDevMode: boolean;
  isExpanded: boolean;
  onClose: () => void;
};

/**
 * Renders the route-selected action sidebar panel without invoking panel
 * renderer helpers as plain functions.
 */
export const ActionSidebarPanel = (props: ActionSidebarPanelProps) => {
  const { activePanel, isDevMode, isExpanded, onClose } = props;

  switch (activePanel) {
    case 'requestList':
      return (
        <RequestList open onClose={onClose} sidebarExpanded={isExpanded} />
      );
    case 'comments':
      return (
        <CommentsPanel open onClose={onClose} sidebarExpanded={isExpanded} />
      );
    case 'protokollierung':
      return <AuditLog open onClose={onClose} sidebarExpanded={isExpanded} />;
    case 'ai-tools':
      return (
        <ActionSidebarPlaceholder
          open
          titleKey="Sidebar.aiTools"
          descriptionKey="Sidebar.aiToolsDescription"
          sidebarExpanded={isExpanded}
          onClose={onClose}
        />
      );
    case 'running-workflows':
      return isDevMode ? (
        <RunningWorkflowsPanel
          open
          onClose={onClose}
          sidebarExpanded={isExpanded}
        />
      ) : null;
    case 'legal-references':
    case null:
      return null;
  }
};
