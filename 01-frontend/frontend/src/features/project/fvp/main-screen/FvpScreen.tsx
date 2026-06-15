import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { getRouteApi } from '@tanstack/react-router';
import { ClipboardList, Files } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiAnalysisSection } from './cards/AiAnalysisSection';
import { DocumentsCard } from './documents-card/DocumentsCard';
import { EditRequiredDocumentsDialog } from './required-documents-card/EditRequiredDocumentsDialog';
import { StartFvpRunDialog } from './StartFvpRunDialog';
import { useFvpAiWorkflowState } from './useFvpAiWorkflowState';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

/** Renders the FVP documents page with workflow start controls and running-progress state. */
export const FvpScreen = () => {
  const { t } = useTranslation('FormalCompletenessCheck');
  const { verfahrenId } = route.useParams();
  const { isEditRequiredDocumentsDialogOpen, isStartFvpRunDialogOpen } =
    route.useSearch({
      select: (search) => ({
        isEditRequiredDocumentsDialogOpen:
          search.isEditRequiredDocumentsDialogOpen,
        isStartFvpRunDialogOpen: search.isStartFvpRunDialogOpen,
      }),
    });
  const navigate = route.useNavigate();
  const fvpWorkflow = useFvpAiWorkflowState(verfahrenId);
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });

  if (fvpWorkflow.isAiAnalysisDecisionLoading) {
    return <div className="flex w-full flex-1 bg-bg-primary" />;
  }

  const closeStartDialog = () =>
    navigate({
      search: (previous) => ({
        ...previous,
        isStartFvpRunDialogOpen: undefined,
      }),
      resetScroll: false,
      replace: true,
    });

  const openStartDialog = () => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      search: (previous) => ({
        ...previous,
        isStartFvpRunDialogOpen: true,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="flex w-full flex-1 justify-center bg-bg-primary">
      <div className="flex w-full max-w-container flex-col gap-10 p-6 pt-8">
        <section
          aria-labelledby="fvp-redesign-page-title"
          className="flex flex-col gap-6"
        >
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-bg-quaternary text-text-primary">
              <ClipboardList aria-hidden="true" className="size-4" />
            </span>
            <h2
              id="fvp-redesign-page-title"
              className="text-body font-medium text-text-primary"
            >
              {t('redesign.pageTitle')}
            </h2>
          </div>
          <AiAnalysisSection
            canMutateProject={canMutateProject}
            workflow={fvpWorkflow}
            projectId={verfahrenId}
            onStartClick={openStartDialog}
          />
        </section>

        {fvpWorkflow.canShowDocuments && (
          <section
            aria-labelledby="fvp-redesign-documents-title"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-bg-quaternary text-text-primary">
                <Files aria-hidden="true" className="size-4" />
              </span>
              <h2
                id="fvp-redesign-documents-title"
                className="text-body font-medium text-text-primary"
              >
                {t('redesign.documentsSectionTitle')}
              </h2>
            </div>
            <DocumentsCard
              isFcsLoading={fvpWorkflow.progress.requiredDocuments.isLoading}
            />
          </section>
        )}
      </div>
      {/* Only one modal overlay renders at a time: the start dialog takes
          precedence so a stale URL with several overlay params cannot stack
          dialogs. */}
      {isEditRequiredDocumentsDialogOpen &&
        canMutateProject &&
        isStartFvpRunDialogOpen !== true && <EditRequiredDocumentsDialog />}
      <StartFvpRunDialog
        verfahrenId={verfahrenId}
        canMutateProject={canMutateProject}
        canStartProcess={fvpWorkflow.canStartProcess}
        open={isStartFvpRunDialogOpen === true && canMutateProject}
        onClose={closeStartDialog}
      />
    </div>
  );
};
