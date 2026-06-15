import {
  SidebarLabel,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLinkButton,
} from '@/features/ui/sidebar/Sidebar';
import { BookOpenText, Clipboard, StickyNote } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { NodesDevToolsIcon } from './NodesDevToolsIcon';
import type { SidebarPanel } from './sidebarSearchParams';
import { RunningWorkflowsIcon } from './workflow-panel/RunningWorkflowsIcon';

type SidebarTriggerRefs = Record<
  SidebarPanel,
  React.RefObject<HTMLButtonElement | null>
>;

type SidebarPanelButtonProps = {
  activePanel: SidebarPanel | null;
  icon: React.ReactNode;
  label: string;
  onItemClick: (itemId: SidebarPanel) => void;
  panel: SidebarPanel;
  ref: React.RefObject<HTMLButtonElement | null>;
  color?: 'ai';
};

type SidebarPanelButtonConfig = Pick<
  SidebarPanelButtonProps,
  'color' | 'icon' | 'label' | 'panel'
>;

type ActionSidebarMenuContentProps = {
  activePanel: SidebarPanel | null;
  isAdmin: boolean;
  isDevMode: boolean;
  isNodesDevToolsRoute: boolean;
  onItemClick: (itemId: SidebarPanel) => void;
  triggerRefs: SidebarTriggerRefs;
  verfahrenId: string;
};

const SidebarPanelButton = (props: SidebarPanelButtonProps) => {
  const { activePanel, color, icon, label, onItemClick, panel, ref } = props;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        ref={ref}
        onClick={() => onItemClick(panel)}
        isActive={activePanel === panel}
        tooltip={label}
        aria-label={label}
        color={color}
        className="cursor-pointer"
      >
        {icon}
        <SidebarLabel>{label}</SidebarLabel>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const isSidebarPanelButtonConfig = (
  config: SidebarPanelButtonConfig | null,
): config is SidebarPanelButtonConfig => config !== null;

const getSidebarPanelButtonConfigs = (
  props: Pick<ActionSidebarMenuContentProps, 'isAdmin' | 'isDevMode'> & {
    t: ReturnType<typeof useTranslation>['t'];
  },
): SidebarPanelButtonConfig[] => {
  const { isAdmin, isDevMode, t } = props;
  const configs: (SidebarPanelButtonConfig | null)[] = [
    isDevMode
      ? {
          panel: 'running-workflows',
          icon: <RunningWorkflowsIcon />,
          label: t('Sidebar.runningWorkflows'),
          color: 'ai',
        }
      : null,
    {
      panel: 'requestList',
      icon: <Clipboard />,
      label: t('Sidebar.requestList'),
    },
    { panel: 'comments', icon: <StickyNote />, label: t('Sidebar.comments') },
    isAdmin
      ? {
          panel: 'protokollierung',
          icon: <BookOpenText />,
          label: t('Sidebar.protokollierung'),
        }
      : null,
  ];

  return configs.filter(isSidebarPanelButtonConfig);
};

export const ActionSidebarMenuContent = (
  props: ActionSidebarMenuContentProps,
) => {
  const { t } = useTranslation('MaterialCompletenessCheck');
  const buttonConfigs = getSidebarPanelButtonConfigs({
    isAdmin: props.isAdmin,
    isDevMode: props.isDevMode,
    t,
  });

  return (
    <>
      {props.isDevMode && (
        <SidebarMenuItem>
          <SidebarMenuLinkButton
            to="/verfahren/$verfahrenId/examination-dev"
            params={{ verfahrenId: props.verfahrenId }}
            search={{}}
            isActive={props.isNodesDevToolsRoute}
            tooltip="Nodes Dev Tools"
            aria-label="Nodes Dev Tools"
            className="cursor-pointer"
          >
            <NodesDevToolsIcon />
            <SidebarLabel>Nodes Dev Tools</SidebarLabel>
          </SidebarMenuLinkButton>
        </SidebarMenuItem>
      )}
      {buttonConfigs.map((button) => (
        <SidebarPanelButton
          key={button.panel}
          ref={props.triggerRefs[button.panel]}
          activePanel={props.activePanel}
          panel={button.panel}
          icon={button.icon}
          label={button.label}
          onItemClick={props.onItemClick}
          color={button.color}
        />
      ))}
    </>
  );
};
