import { createProjectProjectsPostMutation } from '@/api-clients/pls-module/@tanstack/react-query.gen';
import { useAllProjects } from '@/features/project/data/collections/projects.collection';
import { DialogBody, DialogDescription } from '@/features/ui/dialog/Dialog';
import { toast } from '@/features/ui/toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApplicantFormStep,
  type ApplicantStepValues,
} from './ApplicantFormStep';
import { getDefaultApplicantValues } from '@/features/project/data/project-details-form/projectForm.schema';
import { buildCreateProjectBody } from './CreateProjectForm.helpers';
import { CreateProjectFormFooter } from './CreateProjectFormFooter';
import { CreateProjectFormProgress } from './CreateProjectFormProgress';
import {
  formReducer,
  getInitialFormState,
  type FormDefaults,
  type Step,
} from './formReducer';
import { ProjectFormStep } from './ProjectFormStep';

export type CreateProjectFormContentProps = {
  defaultProjectTypeId: string;
  projectTypes: { id: string; name: string }[];
  projectTypesLoadFailed: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (createdProjectId: string | null) => void;
};

/**
 * Coordinates the two-step create-project wizard and dialog-local draft state.
 */
export function CreateProjectFormContent(
  props: CreateProjectFormContentProps,
): React.ReactElement {
  const {
    defaultProjectTypeId,
    projectTypes,
    projectTypesLoadFailed,
    onOpenChange,
    onSuccess,
  } = props;
  const { t } = useTranslation('CreateProjectForm');
  const queryClient = useQueryClient();
  const {
    data: existingProjects,
    isError: existingProjectsLoadFailed,
    isLoading: isLoadingExistingProjects,
  } = useAllProjects();
  const createProjectMutation = useMutation(
    createProjectProjectsPostMutation(),
  );
  const formSubmit1Ref = useRef<(() => void) | null>(null);
  const formValues2Ref = useRef<(() => ApplicantStepValues) | null>(null);
  const formSubmit2Ref = useRef<(() => void) | null>(null);

  const formDefaults: FormDefaults = {
    defaultProjectTypeId,
    defaultApplicantValues: getDefaultApplicantValues(t),
  };

  const [state, dispatch] = useReducer(
    formReducer,
    formDefaults,
    getInitialFormState,
  );
  const {
    currentStep,
    submitError,
    createdProjectId,
    step1Values,
    step2Values,
  } = state;

  const isSubmitting = createProjectMutation.isPending;

  const stepTitles: Record<Step, string> = {
    1: t('step1.title'),
    2: t('step2.title'),
  };
  const existingInternalProjectNumbers = existingProjects.map(
    (project) => project.internalProjectNumber,
  );
  const isStep1BlockedByProjectsDependency =
    currentStep === 1 &&
    (isLoadingExistingProjects || existingProjectsLoadFailed);

  const resetFormAndClose = async (projectId?: string | null) => {
    await queryClient.invalidateQueries({
      queryKey: ['projects'],
    });
    onOpenChange(false);
    dispatch({ type: 'RESET', defaults: formDefaults });
    onSuccess?.(projectId ?? createdProjectId);
  };

  const createProjectAndFinish = (applicantValues: ApplicantStepValues) => {
    // Guard against double-submission (e.g. Enter re-triggering the native
    // form) while the create request is already in flight.
    if (createProjectMutation.isPending) {
      return;
    }
    dispatch({ type: 'SET_SUBMIT_ERROR', payload: null });
    // The creator identity is derived server-side from the OIDC user, so the
    // frontend intentionally omits a client-authored `createdById`.
    const body = buildCreateProjectBody(step1Values, applicantValues);
    createProjectMutation.mutate(
      { body },
      {
        onSuccess: (data) => {
          dispatch({ type: 'SET_CREATED_PROJECT_ID', payload: data.id });
          toast.success(t('submitSuccess'));
          void resetFormAndClose(data.id);
        },
        onError: () => {
          dispatch({ type: 'SET_SUBMIT_ERROR', payload: t('submitError') });
        },
      },
    );
  };

  const handleNext = () => {
    dispatch({ type: 'SET_SUBMIT_ERROR', payload: null });
    if (currentStep === 1) {
      formSubmit1Ref.current?.();
      return;
    }
    formSubmit2Ref.current?.();
  };

  const handleBack = () => {
    dispatch({ type: 'SET_SUBMIT_ERROR', payload: null });
    const currentStep2Values = formValues2Ref.current?.();
    if (currentStep2Values) {
      dispatch({ type: 'SET_STEP2', payload: currentStep2Values });
    }
    dispatch({ type: 'GO_TO_STEP', payload: 1 });
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      dispatch({ type: 'RESET', defaults: formDefaults });
    }
    onOpenChange(next);
  };

  return (
    <>
      <CreateProjectFormProgress
        currentStep={currentStep}
        stepTitles={stepTitles}
        navigationLabel={t('stepsAriaLabel')}
      />

      <DialogBody className="pt-0">
        <DialogDescription className="mb-5 text-sm font-medium text-brand-navy">
          {t('fillRequiredFields')}
        </DialogDescription>

        {currentStep === 1 && (
          <>
            <ProjectFormStep
              defaultValues={step1Values}
              existingInternalProjectNumbers={existingInternalProjectNumbers}
              projectTypes={projectTypes}
              projectTypesLoadFailed={projectTypesLoadFailed}
              disableSubmit={isStep1BlockedByProjectsDependency}
              onSubmit={(values) => {
                dispatch({ type: 'SET_STEP1', payload: values });
                dispatch({ type: 'GO_TO_STEP', payload: 2 });
              }}
              onFormReady={(methods) => {
                formSubmit1Ref.current = methods.submit;
              }}
            />
            {isLoadingExistingProjects && (
              <div
                className="mt-3 rounded border border-border-primary bg-neutral-white p-3 text-text-secondary"
                aria-live="polite"
              >
                {t('loadingExistingProjects')}
              </div>
            )}
            {existingProjectsLoadFailed && (
              <div
                className="mt-3 rounded border border-red-400 bg-red-100 p-3 text-red-700"
                role="alert"
                aria-live="assertive"
              >
                {t('existingProjectsLoadError')}
              </div>
            )}
          </>
        )}

        {currentStep === 2 && (
          <div
            aria-describedby={
              submitError ? 'create-project-submit-error' : undefined
            }
          >
            <ApplicantFormStep
              defaultValues={step2Values}
              onSubmit={(values) => {
                dispatch({ type: 'SET_STEP2', payload: values });
                createProjectAndFinish(values);
              }}
              onFormReady={(methods) => {
                formValues2Ref.current = methods.getValues;
                formSubmit2Ref.current = methods.submit;
              }}
            />
            {submitError && (
              <div
                id="create-project-submit-error"
                className="mt-3 rounded border border-red-400 bg-red-100 p-3 text-red-700"
                role="alert"
                aria-live="assertive"
              >
                {submitError}
              </div>
            )}
          </div>
        )}
      </DialogBody>

      <CreateProjectFormFooter
        currentStep={currentStep}
        disableNext={isStep1BlockedByProjectsDependency}
        isSubmitting={isSubmitting}
        onBack={handleBack}
        onCancel={() => handleClose(false)}
        onNext={handleNext}
      />
    </>
  );
}
