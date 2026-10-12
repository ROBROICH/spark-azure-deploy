import type { ProjectTypeResponse } from '@/api-clients/backend';
import { isProjectTypeConflictError } from '@/features/project/data/project-types/projectTypeMutationError';
import { projectTypesCollection } from '@/features/project/data/project-types/projectTypes.collection';
import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { toast } from '@/features/ui/toast/Toast';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeleteProjectTypeDialog } from './DeleteProjectTypeDialog';
import { isPartialProjectTypeCloneError } from './duplicateProjectType.errors';
import { ProjectTypeDuplicateRecovery } from './ProjectTypeDuplicateRecovery';
import { ProjectTypeNameDialog } from './ProjectTypeNameDialog';
import { ProjectTypesTable } from './ProjectTypesTable';
import { resolveProjectTypesNameDialog } from './projectTypesNameDialog.logic';
import { useDuplicateProjectType } from './useDuplicateProjectType';
import { useProjectTypeMutations } from './useProjectTypeMutations';

type ProjectTypesDialogState =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'rename'; projectType: ProjectTypeResponse }
  | { type: 'duplicate'; projectType: ProjectTypeResponse }
  | {
      type: 'delete';
      projectType: ProjectTypeResponse;
      conflict: boolean;
    };

type DuplicateRecoveryState =
  | { status: 'none' }
  | {
      status: 'partial';
      projectTypeId: string;
      projectTypeName: string;
    };

const ProjectTypesListSkeleton = () => (
  <div
    className="overflow-clip rounded-lg border border-border-primary"
    {...skeletonListProps}
  >
    {Array.from({ length: 3 }).map((_, index) => (
      <div
        key={index}
        className="flex border-b border-border-primary last:border-b-0"
      >
        <div className="flex-1 px-3 py-[11px]">
          <Skeleton className="h-[18px] w-40" aria-hidden />
        </div>
        <div className="w-28 px-3 py-[11px]">
          <Skeleton className="h-[18px] w-16" aria-hidden />
        </div>
        <div className="w-44 p-2">
          <Skeleton className="h-8 w-28" aria-hidden />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Administration list for managing deployment project types: create, rename,
 * duplicate, deactivate/reactivate, and guarded delete against the Project
 * Logic Service.
 *
 * @returns The project-types card with loading, empty, error, and dialog flows.
 */
export function ProjectTypesSection() {
  const { t } = useTranslation('Administration');
  const navigate = useNavigate();
  const {
    data: projectTypes,
    isLoading,
    isError,
  } = useLiveQuery((q) => q.from({ projectTypes: projectTypesCollection }));
  const {
    createProjectType,
    renameProjectType,
    setProjectTypeActive,
    deleteProjectType,
  } = useProjectTypeMutations();
  const duplicateProjectType = useDuplicateProjectType();

  // eslint-disable-next-line no-restricted-syntax -- ephemeral dialog owner for create/rename/duplicate/delete
  const [dialog, setDialog] = useState<ProjectTypesDialogState>({
    type: 'closed',
  });
  /* eslint-disable no-restricted-syntax -- ephemeral recovery banner after a non-atomic duplicate */
  const [duplicateRecovery, setDuplicateRecovery] =
    useState<DuplicateRecoveryState>({
      status: 'none',
    });
  /* eslint-enable no-restricted-syntax */

  const closeDialog = () => setDialog({ type: 'closed' });
  const isNamePending =
    createProjectType.isPending ||
    renameProjectType.isPending ||
    duplicateProjectType.isPending;
  const isDeletePending =
    deleteProjectType.isPending || setProjectTypeActive.isPending;

  const handleCreate = async (name: string) => {
    await createProjectType.mutateAsync(name);
    toast.success(t('projectTypes.toasts.createSuccess'));
  };

  const handleRename = async (
    projectType: ProjectTypeResponse,
    name: string,
  ) => {
    await renameProjectType.mutateAsync({
      id: projectType.id,
      name,
      active: projectType.active,
    });
    toast.success(t('projectTypes.toasts.renameSuccess'));
  };

  /**
   * Completes duplication only after the clone exists, then opens its detail
   * route. A leftover project type after failed cleanup is recovery, not success.
   *
   * @param projectType Source project type to copy.
   * @param name Confirmed name for the clone.
   * @returns Resolves after navigation, recovery recording, or a name conflict.
   */
  const handleDuplicate = async (
    projectType: ProjectTypeResponse,
    name: string,
  ) => {
    try {
      const created = await duplicateProjectType.mutateAsync({
        source: projectType,
        name,
      });
      setDuplicateRecovery({ status: 'none' });
      toast.success(t('projectTypes.toasts.duplicateSuccess'));
      await navigate({
        to: '/administration/$projectTypeId',
        params: { projectTypeId: created.id },
      });
    } catch (error) {
      if (isPartialProjectTypeCloneError(error)) {
        setDuplicateRecovery({
          status: 'partial',
          projectTypeId: error.projectTypeId,
          projectTypeName: error.projectTypeName,
        });
        return;
      }

      if (isProjectTypeConflictError(error)) {
        throw error;
      }
    }
  };

  const persistActive = async (
    projectType: ProjectTypeResponse,
    active: boolean,
  ) => {
    await setProjectTypeActive.mutateAsync({
      id: projectType.id,
      name: projectType.name,
      active,
    });
    toast.success(
      active
        ? t('projectTypes.toasts.reactivateSuccess')
        : t('projectTypes.toasts.deactivateSuccess'),
    );
    closeDialog();
  };

  const handleToggleActive = async (projectType: ProjectTypeResponse) => {
    await persistActive(projectType, !projectType.active);
  };

  const handleDeactivate = async (projectType: ProjectTypeResponse) => {
    await persistActive(projectType, false);
  };

  const handleDelete = async (projectType: ProjectTypeResponse) => {
    try {
      await deleteProjectType.mutateAsync(projectType.id);
      toast.success(t('projectTypes.toasts.deleteSuccess'));
      closeDialog();
    } catch (error) {
      if (!isProjectTypeConflictError(error)) {
        return;
      }
      setDialog({ type: 'delete', projectType, conflict: true });
    }
  };

  const nameDialog = resolveProjectTypesNameDialog(dialog, (name) =>
    t('projectTypes.duplicateName', { name }),
  );

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="project-types-heading"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="project-types-heading"
          className="flex-1 text-base font-medium tracking-tight text-text-primary"
        >
          {t('projectTypes.title')}
        </h2>
        <Button
          variant="secondary"
          size="sm"
          withIcon
          type="button"
          onClick={() => setDialog({ type: 'create' })}
        >
          <Plus aria-hidden />
          {t('projectTypes.createButton')}
        </Button>
      </div>

      {isLoading ? (
        <div role="status" aria-label={t('projectTypes.loading')}>
          <ProjectTypesListSkeleton />
        </div>
      ) : null}

      {isError ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border-[0.5px] border-border-secondary bg-neutral-white p-3">
          <p role="alert" className="text-sm text-text-secondary">
            {t('projectTypes.loadError')}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void projectTypesCollection.utils.refetch();
            }}
          >
            {t('projectTypes.retry')}
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && projectTypes.length === 0 ? (
        <p className="text-sm text-text-secondary">{t('projectTypes.empty')}</p>
      ) : null}

      {duplicateRecovery.status === 'partial' ? (
        <ProjectTypeDuplicateRecovery
          projectTypeId={duplicateRecovery.projectTypeId}
          projectTypeName={duplicateRecovery.projectTypeName}
        />
      ) : null}

      {!isLoading && !isError && projectTypes.length > 0 ? (
        <ProjectTypesTable
          projectTypes={projectTypes}
          isTogglePending={setProjectTypeActive.isPending}
          onRename={(next) => setDialog({ type: 'rename', projectType: next })}
          onDuplicate={(next) =>
            setDialog({ type: 'duplicate', projectType: next })
          }
          onToggleActive={(next) => {
            void handleToggleActive(next);
          }}
          onDelete={(next) =>
            setDialog({
              type: 'delete',
              projectType: next,
              conflict: false,
            })
          }
        />
      ) : null}

      {nameDialog ? (
        <ProjectTypeNameDialog
          key={nameDialog.remountKey}
          mode={nameDialog.mode}
          open
          initialName={nameDialog.initialName}
          onOpenChange={(open) => {
            if (!open && isNamePending) {
              return;
            }
            if (!open) {
              closeDialog();
            }
          }}
          onPersist={async (name) => {
            if (dialog.type === 'rename') {
              await handleRename(dialog.projectType, name);
              return;
            }
            if (dialog.type === 'duplicate') {
              await handleDuplicate(dialog.projectType, name);
              return;
            }
            await handleCreate(name);
          }}
        />
      ) : null}

      <DeleteProjectTypeDialog
        projectType={dialog.type === 'delete' ? dialog.projectType : null}
        conflict={dialog.type === 'delete' ? dialog.conflict : false}
        isPending={isDeletePending}
        onOpenChange={(open) => {
          if (!open && isDeletePending) {
            return;
          }
          if (!open) {
            closeDialog();
          }
        }}
        onConfirm={() => {
          if (dialog.type !== 'delete') {
            return;
          }
          void handleDelete(dialog.projectType);
        }}
        onDeactivateInstead={() => {
          if (dialog.type !== 'delete') {
            return;
          }
          void handleDeactivate(dialog.projectType);
        }}
      />
    </section>
  );
}
