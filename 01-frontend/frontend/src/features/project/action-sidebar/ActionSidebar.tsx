import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { useDevMode } from '@/features/dev-mode/useDevMode';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/features/ui/sidebar/Sidebar';
import {
  getRouteApi,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import type React from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSidebarMenuContent } from './ActionSidebarMenuContent';
import { ActionSidebarPanel } from './ActionSidebarPanel';
import type { ActionSidebarSearch, SidebarPanel } from './sidebarSearchParams';

const route = getRouteApi('/verfahren/$verfahrenId');

type SidebarTriggerRefs = Record<
  SidebarPanel,
  React.RefObject<HTMLButtonElement | null>
>;

type SidebarToggleButtonProps = {
  isExpanded: boolean;
  onToggleSidebar: () => void;
  t: ReturnType<typeof useTranslation>['t'];
};

const emptyPanelSearchRetention = {
  newRequestListInitItems: undefined,
  newCommentInitItems: undefined,
  protocolWorkflowRunId: undefined,
  protocolRequestId: undefined,
  protocolOffset: undefined,
  protocolDrilldownOffset: undefined,
} satisfies Partial<ActionSidebarSearch>;

const panelSearchRetention = {
  requestList: (prev) => ({
    newRequestListInitItems: prev.newRequestListInitItems,
  }),
  comments: (prev) => ({
    newCommentInitItems: prev.newCommentInitItems,
  }),
  protokollierung: (prev) => ({
    protocolWorkflowRunId: prev.protocolWorkflowRunId,
    protocolRequestId: prev.protocolRequestId,
    protocolOffset: prev.protocolOffset,
    protocolDrilldownOffset: prev.protocolDrilldownOffset,
  }),
  'ai-tools': () => ({}),
  'legal-references': () => ({}),
  'running-workflows': () => ({}),
} satisfies Record<
  SidebarPanel,
  (prev: ActionSidebarSearch) => Partial<ActionSidebarSearch>
>;

const getPanelSearchRetention = (
  prev: ActionSidebarSearch,
  panel: SidebarPanel | null,
): Partial<ActionSidebarSearch> => {
  if (!panel) {
    return {};
  }

  return panelSearchRetention[panel](prev);
};

/**
 * Preserves the next panel's route-owned draft state while clearing stale state
 * from panels that are no longer active.
 */
const createActivePanelSearch = (
  prev: ActionSidebarSearch,
  panel: SidebarPanel | null,
): ActionSidebarSearch => ({
  ...prev,
  ...emptyPanelSearchRetention,
  deleteRequestItemId: undefined,
  deleteCommentId: undefined,
  sidebarPanel: panel ?? undefined,
  ...getPanelSearchRetention(prev, panel),
});

const createClosedPanelSearch = (
  prev: ActionSidebarSearch,
): ActionSidebarSearch => ({
  ...prev,
  ...emptyPanelSearchRetention,
  sidebarPanel: undefined,
  deleteRequestItemId: undefined,
  deleteCommentId: undefined,
});

const getActivePanel = (
  sidebarPanel: SidebarPanel | undefined,
  isAdmin: boolean,
): SidebarPanel | null => {
  if (sidebarPanel === 'protokollierung' && !isAdmin) {
    return null;
  }

  return sidebarPanel ?? null;
};

const useSidebarTriggerRefs = (): SidebarTriggerRefs => {
  const aiToolsRef = useRef<HTMLButtonElement>(null);
  const runningWorkflowsRef = useRef<HTMLButtonElement>(null);
  const requestListRef = useRef<HTMLButtonElement>(null);
  const commentsRef = useRef<HTMLButtonElement>(null);
  const legalReferencesRef = useRef<HTMLButtonElement>(null);
  const protokollierungRef = useRef<HTMLButtonElement>(null);

  return {
    'ai-tools': aiToolsRef,
    'running-workflows': runningWorkflowsRef,
    requestList: requestListRef,
    comments: commentsRef,
    'legal-references': legalReferencesRef,
    protokollierung: protokollierungRef,
  };
};

const SidebarToggleButton = (props: SidebarToggleButtonProps) => {
  const { isExpanded, onToggleSidebar, t } = props;
  const label = isExpanded
    ? t('Sidebar.collapseSidebar')
    : t('Sidebar.expandSidebar');

  return (
    <SidebarMenuButton
      onClick={onToggleSidebar}
      tooltip={label}
      aria-label={label}
      className="cursor-pointer"
    >
      {isExpanded ? <PanelRightClose /> : <PanelRightOpen />}
      <SidebarLabel>{label}</SidebarLabel>
    </SidebarMenuButton>
  );
};

/**
 * Owns the shared right-sidebar panel routing and focus return for project
 * routes.
 */
export const ActionSidebar = () => {
  const navigate = useNavigate();
  const { sidebarPanel } = route.useSearch();
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('MaterialCompletenessCheck');
  const { open: isExpanded, toggleSidebar } = useSidebar();
  const [isDevMode] = useDevMode();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isNodesDevToolsRoute = pathname.endsWith('/examination-dev');
  const { role } = useCurrentUser();
  const isAdmin = role === 'admin';
  const activePanel = getActivePanel(sidebarPanel, isAdmin);
  const triggerRefs = useSidebarTriggerRefs();

  const setActivePanel = (panel: SidebarPanel | null) => {
    navigate({
      to: '.',
      search: (prev) => createActivePanelSearch(prev, panel),
      replace: true,
      resetScroll: false,
    });
  };

  const closePanel = () => {
    // Returns focus to the sidebar trigger for the active panel. Panels can also
    // be opened from other controls (for example a norm card's dropdown menu);
    // restoring focus to the true opener requires tracking it across route-driven
    // opens and is tracked separately as a follow-up a11y improvement.
    if (activePanel) {
      triggerRefs[activePanel].current?.focus();
    }
    navigate({
      to: '.',
      search: createClosedPanelSearch,
      replace: true,
      resetScroll: false,
    });
  };
  const handleItemClick = (itemId: SidebarPanel) => {
    if (activePanel === itemId) {
      setActivePanel(null);
      return;
    }

    setActivePanel(itemId);
  };

  return (
    <>
      <ActionSidebarPanel
        activePanel={activePanel}
        isDevMode={isDevMode}
        isExpanded={isExpanded}
        onClose={closePanel}
      />
      <Sidebar
        side="right"
        collapsible="icon"
        expandDirection="right-to-left"
        className="z-40"
        aria-label={t('Sidebar.actionSidebarAriaLabel')}
      >
        <SidebarContent className="overflow-hidden p-2">
          <SidebarMenu>
            <SidebarMenuItem aria-hidden className="min-h-8" />
          </SidebarMenu>
          <SidebarSeparator className="mt-1 bg-slate-200" />
          <SidebarMenu>
            <ActionSidebarMenuContent
              activePanel={activePanel}
              isAdmin={isAdmin}
              isDevMode={isDevMode}
              isNodesDevToolsRoute={isNodesDevToolsRoute}
              onItemClick={handleItemClick}
              triggerRefs={triggerRefs}
              verfahrenId={verfahrenId}
            />
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="mt-auto p-2 pt-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarToggleButton
                isExpanded={isExpanded}
                onToggleSidebar={toggleSidebar}
                t={t}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
};
