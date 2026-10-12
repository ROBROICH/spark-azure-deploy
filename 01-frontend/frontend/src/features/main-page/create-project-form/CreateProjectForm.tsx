import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { selectActiveProjectTypes } from '@/features/project/data/project-types/projectTypeOptions.logic';
import { projectTypesCollection } from '@/features/project/data/project-types/projectTypes.collection';
import { useLiveQuery } from '@tanstack/react-db';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { CreateProjectFormContent } from './CreateProjectFormContent';

type CreateProjectFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (createdProjectId: string | null) => void;
};

/** Loads project types, then shows create-project wizard or loading/error in a dialog. */
export const CreateProjectForm = (
  props: CreateProjectFormProps,
): React.ReactElement => {
  const { open, onOpenChange, onSuccess } = props;
  const { t } = useTranslation('CreateProjectForm');
  const { data: projectTypes, isLoading: isLoadingProjectTypes } = useLiveQuery(
    (q) => q.from({ projectTypes: projectTypesCollection }),
  );
  const activeProjectTypes = selectActiveProjectTypes(projectTypes);
  const projectTypesLoadFailed =
    !isLoadingProjectTypes && projectTypes.length === 0;
  const [firstActiveProjectType] = activeProjectTypes;

  const formReady =
    open &&
    !isLoadingProjectTypes &&
    !projectTypesLoadFailed &&
    activeProjectTypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-screen"
        showCloseButton
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {open && formReady && firstActiveProjectType && (
          <CreateProjectFormContent
            key={firstActiveProjectType.id}
            defaultProjectTypeId={firstActiveProjectType.id}
            projectTypes={activeProjectTypes}
            projectTypesLoadFailed={projectTypesLoadFailed}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        )}
        {open && !formReady && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12">
            {isLoadingProjectTypes && (
              <DialogDescription className="text-foreground text-body-m">
                {t('loadingProjectTypes')}
              </DialogDescription>
            )}
            {projectTypesLoadFailed && (
              <DialogDescription
                className="text-body-m text-destructive"
                role="alert"
              >
                {t('projectTypesLoadError')}
              </DialogDescription>
            )}
            {!isLoadingProjectTypes &&
              !projectTypesLoadFailed &&
              activeProjectTypes.length === 0 && (
                <DialogDescription className="text-foreground text-body-m">
                  {t('noActiveProjectTypes')}
                </DialogDescription>
              )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
