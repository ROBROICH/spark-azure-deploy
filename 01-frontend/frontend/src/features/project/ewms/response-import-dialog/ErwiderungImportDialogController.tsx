import { reloadProjectNodeTreeAndPayloads } from '@/db/nodes/collections/reloadProjectNodeTreeAndPayloads';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { isEwmsFeatureEnabled } from '@/features/project/ewms/ewmsFeature';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { getRouteApi } from '@tanstack/react-router';
import { ErwiderungImportDialog } from './ErwiderungImportDialog';

const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

/** Connects the Erwiderung import dialog to EWMS route search state and refreshes node data after imports. */
export const ErwiderungImportDialogController = () => {
  const { responseImportDialogOpen } = route.useSearch({
    select: (search) => ({
      responseImportDialogOpen: search.responseImportDialogOpen,
    }),
  });
  const { verfahrenId } = route.useParams();
  const navigate = route.useNavigate();
  const isFeatureEnabled = isEwmsFeatureEnabled();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const projectVersion = useProjectRouteVersion();

  if (!isFeatureEnabled) {
    return null;
  }

  const handleOpenChange = (open: boolean) => {
    navigate({
      search: (prev) => ({
        ...prev,
        responseImportDialogOpen: open ? true : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleImported = async () => {
    await reloadProjectNodeTreeAndPayloads(verfahrenId, projectVersion);
  };

  return (
    <ErwiderungImportDialog
      open={responseImportDialogOpen === true && canMutateProject}
      projectId={verfahrenId}
      onImported={handleImported}
      onOpenChange={handleOpenChange}
    />
  );
};
