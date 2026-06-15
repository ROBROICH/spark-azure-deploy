import { useCanDeleteProject } from '@/features/access-control/project-permissions/useCanDeleteProject';
import {
  projectsCollection,
  useProject,
} from '@/features/project/data/collections/projects.collection';
import {
  MAX_FAVORITES,
  useFavorites,
} from '@/features/project/data/project-favorites/useFavorites';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { StarButton } from '@/features/ui/star-button/StarButton';
import { toast } from '@/features/ui/toast/Toast';
import { Link, useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type ProjectOverviewNavbarSectionProps = {
  verfahrenId: string;
};

type DeleteProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  projectName: string;
  isDeleting: boolean;
};

function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const { open, onOpenChange, onConfirm, projectName, isDeleting } = props;
  const { t } = useTranslation('shared');

  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {t('projectNavbar.deleteProjectConfirmTitle')}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription>
            {t('projectNavbar.deleteProjectConfirmDescription', {
              projectName,
            })}
          </DialogDescription>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            type="button"
            size="sm"
            disabled={isDeleting}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('projectNavbar.deleteCancel')}
          </Button>
          <Button
            variant="danger"
            type="button"
            loading={isDeleting}
            onClick={onConfirm}
          >
            {t('projectNavbar.deleteConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Overview-only lower navbar section with title and project actions. */
export function ProjectOverviewNavbarSection(
  props: ProjectOverviewNavbarSectionProps,
) {
  const { verfahrenId } = props;
  const { t } = useTranslation('shared');
  const navigate = useNavigate();
  const { canDeleteProject } = useCanDeleteProject();
  const { isFavorite, toggle, remove, canFavorite } = useFavorites();
  const { data: project, isLoading } = useProject(verfahrenId);
  const [deleteDialogOpen, setDeleteDialogOpen] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for the delete confirmation dialog.
    useState(false);
  const [isDeleteFlowPending, setIsDeleteFlowPending] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state keeps the destructive flow locked until redirect completes.
    useState(false);

  const hasProjectData = project !== null;
  const isDeletingProject = isDeleteFlowPending;

  const handleDeleteProject = async () => {
    if (!canDeleteProject || !project || isDeletingProject) {
      return;
    }

    try {
      setIsDeleteFlowPending(true);
      await projectsCollection.utils.deleteProject(verfahrenId);
      remove(verfahrenId);
      await navigate({ to: '/', replace: true });
      toast.success(
        t('projectNavbar.deleteProjectSuccess', { projectName: project.name }),
      );
    } catch {
      setIsDeleteFlowPending(false);
      toast.error(t('projectNavbar.deleteProjectError'));
    }
  };

  return (
    <div className="bg-neutral-white px-0 py-6">
      <div className="flex items-center gap-4">
        {isLoading || !hasProjectData ? (
          <Skeleton className="size-12 shrink-0 rounded-xl" aria-hidden />
        ) : (
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-200 p-1"
            aria-hidden
          >
            <span className="text-base leading-5 font-medium text-text-primary">
              {project.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isLoading || !hasProjectData ? (
            <>
              <Skeleton className="h-6 w-2/3" aria-hidden />
              <Skeleton className="h-5 w-1/4" aria-hidden />
            </>
          ) : (
            <>
              <h1 className="text-[19px] leading-6 font-medium tracking-tight [overflow-wrap:anywhere] break-words text-text-primary">
                {project.name}
              </h1>
              <p className="text-base leading-5 font-medium tracking-tight text-text-secondary">
                {project.internalProjectNumber}
              </p>
            </>
          )}
        </div>

        {isLoading || !hasProjectData ? (
          <Skeleton className="h-11 w-52 shrink-0 rounded-xl" />
        ) : (
          <div className="flex items-center gap-2">
            <StarButton
              isFavorite={isFavorite(verfahrenId)}
              size="lg"
              onToggle={() => toggle(verfahrenId)}
              ariaLabel={
                isFavorite(verfahrenId)
                  ? t('projectNavbar.unfavoriteProject')
                  : t('projectNavbar.favoriteProject')
              }
              limitTooltip={
                !canFavorite
                  ? t('projectNavbar.favoriteLimitReached', {
                      count: MAX_FAVORITES,
                    })
                  : undefined
              }
              className="mx-4"
            />
            {canDeleteProject ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  iconOnly
                  aria-label={t('projectNavbar.deleteProject')}
                  onClick={() => {
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
                <DeleteProjectDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  onConfirm={() => {
                    void handleDeleteProject();
                  }}
                  projectName={project.name}
                  isDeleting={isDeletingProject}
                />
              </>
            ) : null}
            <Button type="button" size="lg" asChild className="min-w-[13rem]">
              <Link
                to="/verfahren/$verfahrenId/fvp/documents"
                params={{ verfahrenId }}
                search={{}}
                resetScroll={false}
              >
                {t('projectNavbar.goToProject')}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
