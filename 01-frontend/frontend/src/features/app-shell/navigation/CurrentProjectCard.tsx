import { listProcessStepsProcessStepsGet } from '@/api-clients/pls-module';
import { useProject } from '@/features/project/data/collections/projects.collection';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuLinkButton,
  SidebarSeparator,
} from '@/features/ui/sidebar/Sidebar';
import { useQuery } from '@tanstack/react-query';
import { useMatch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { NavProjectCard } from './NavProjectCard';
import { getProjectAvatarLabel } from '@/features/project/route/projectAvatarLabel';

type CurrentProjectCardProps = {
  expandedId: string | null;
  onToggle: (id: string) => void;
  onNavigate: () => void;
};

/**
 * Renders the "current project" card in the sidebar when the user is inside
 * a /verfahren/:id route. Returns null when on any other route.
 *
 * Uses useMatch with shouldThrow: false to detect the route without relying
 * on pathname regex parsing.
 */
export function CurrentProjectCard(props: CurrentProjectCardProps) {
  const { expandedId, onToggle, onNavigate } = props;
  const { t } = useTranslation('shared');

  const match = useMatch({
    from: '/verfahren/$verfahrenId',
    shouldThrow: false,
  });

  const verfahrenId = match?.params.verfahrenId ?? null;

  const { data: currentProject } = useProject(verfahrenId);

  const { data: processSteps } = useQuery({
    queryKey: ['process-steps'],
    queryFn: async () => {
      const { data } = await listProcessStepsProcessStepsGet();
      return data ?? [];
    },
    staleTime: Infinity,
  });

  if (!verfahrenId) {
    return null;
  }

  if (!currentProject) {
    return null;
  }

  const getActiveStepIndex = (currentProcessStepId?: string | null) => {
    if (!currentProcessStepId || !processSteps) {
      return null;
    }
    const step = processSteps.find((s) => s.id === currentProcessStepId);
    return step ? step.processStepIndex : null;
  };

  const cardKey = `current:${currentProject.id}`;

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup className="p-0">
        <SidebarGroupLabel className="my-2 px-2 text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-300 normal-case group-data-[collapsible=icon]:hidden">
          {t('sidebar.currentProject')}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="group-data-[collapsible=icon]:hidden">
                <NavProjectCard
                  projectId={currentProject.id}
                  name={currentProject.name}
                  projectNumber={currentProject.internalProjectNumber}
                  initials={getProjectAvatarLabel(currentProject.name)}
                  activeStepIndex={getActiveStepIndex(
                    currentProject.currentProcessStepId,
                  )}
                  expanded={expandedId === cardKey}
                  onToggle={() => onToggle(cardKey)}
                  onNavigate={onNavigate}
                  alwaysWhiteInitials
                />
              </div>
              <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                <SidebarMenuLinkButton
                  to="/verfahren/$verfahrenId"
                  params={{ verfahrenId: currentProject.id }}
                  aria-label={currentProject.name}
                  tooltip={currentProject.name}
                  className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                  onClick={onNavigate}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-white text-[11px] font-medium text-slate-900">
                    {getProjectAvatarLabel(currentProject.name)}
                  </span>
                </SidebarMenuLinkButton>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
