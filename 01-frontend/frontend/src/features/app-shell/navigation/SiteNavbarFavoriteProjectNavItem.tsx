import { useProject } from '@/features/project/data/collections/projects.collection';
import {
  SidebarMenuItem,
  SidebarMenuLinkButton,
} from '@/features/ui/sidebar/Sidebar';
import { NavProjectCard } from './NavProjectCard';
import { getProjectAvatarLabel } from '@/features/project/route/projectAvatarLabel';

type SiteNavbarFavoriteProjectNavItemProps = {
  projectId: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onNavigate: () => void;
};

export function SiteNavbarFavoriteProjectNavItem(
  props: SiteNavbarFavoriteProjectNavItemProps,
) {
  const { projectId, expandedId, onToggle, onNavigate } = props;
  const { data: project } = useProject(projectId);

  if (!project) {
    return null;
  }

  return (
    <SidebarMenuItem>
      <div className="group-data-[collapsible=icon]:hidden">
        <NavProjectCard
          projectId={project.id}
          name={project.name}
          projectNumber={project.internalProjectNumber}
          initials={getProjectAvatarLabel(project.name)}
          expanded={expandedId === `fav:${project.id}`}
          onToggle={() => onToggle(`fav:${project.id}`)}
          onNavigate={onNavigate}
        />
      </div>
      <div className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
        <SidebarMenuLinkButton
          to="/verfahren/$verfahrenId"
          params={{ verfahrenId: project.id }}
          aria-label={project.name}
          tooltip={project.name}
          className="group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={onNavigate}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-slate-300 text-[11px] font-medium text-slate-700">
            {getProjectAvatarLabel(project.name)}
          </span>
        </SidebarMenuLinkButton>
      </div>
    </SidebarMenuItem>
  );
}
