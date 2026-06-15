import {
  type ApplicantStepValues,
  type ProjectStepValues,
  getDefaultProjectValues,
} from '@/features/project/data/project-details-form/projectForm.schema';

export type Step = 1 | 2;

export type CreateProjectFormState = {
  currentStep: Step;
  submitError: string | null;
  createdProjectId: string | null;
  step1Values: ProjectStepValues;
  step2Values: ApplicantStepValues;
};

export type FormDefaults = {
  defaultProjectTypeId: string;
  defaultApplicantValues: ApplicantStepValues;
};

export const getInitialFormState = (
  defaults: FormDefaults,
): CreateProjectFormState => ({
  currentStep: 1,
  submitError: null,
  createdProjectId: null,
  step1Values: getDefaultProjectValues(defaults.defaultProjectTypeId),
  step2Values: defaults.defaultApplicantValues,
});

export type FormAction =
  | { type: 'SET_STEP1'; payload: ProjectStepValues }
  | { type: 'SET_STEP2'; payload: ApplicantStepValues }
  | { type: 'GO_TO_STEP'; payload: Step }
  | { type: 'SET_SUBMIT_ERROR'; payload: string | null }
  | { type: 'SET_CREATED_PROJECT_ID'; payload: string | null }
  | { type: 'RESET'; defaults: FormDefaults };

/** Central state transitions for the two-step create-project dialog flow. */
export function formReducer(
  state: CreateProjectFormState,
  action: FormAction,
): CreateProjectFormState {
  switch (action.type) {
    case 'SET_STEP1':
      return { ...state, step1Values: action.payload };
    case 'SET_STEP2':
      return { ...state, step2Values: action.payload };
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_SUBMIT_ERROR':
      return { ...state, submitError: action.payload };
    case 'SET_CREATED_PROJECT_ID':
      return { ...state, createdProjectId: action.payload };
    case 'RESET':
      return getInitialFormState(action.defaults);
    default:
      return state;
  }
}
