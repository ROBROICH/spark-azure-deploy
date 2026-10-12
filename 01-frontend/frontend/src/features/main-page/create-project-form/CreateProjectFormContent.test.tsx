import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantStepValues } from './ApplicantFormStep';
import { CreateProjectFormContent } from './CreateProjectFormContent';
import type * as FormReducerModule from './formReducer';
import type { FormDefaults } from './formReducer';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  invalidateQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: mocks.mutate, isPending: mocks.isPending }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/api-clients/backend/@tanstack/react-query.gen', () => ({
  v1ProjectLogicCreateProjectMutation: () => ({}),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/ui/dialog/Dialog', () => ({
  DialogBody: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogDescription: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogFooter: (props: { children?: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

// Stub the step children so the test can trigger the applicant submit directly.
vi.mock('./ProjectFormStep', () => ({
  ProjectFormStep: () => <div>project-step</div>,
}));

const applicantValues: ApplicantStepValues = {
  company: '',
  firstName: '',
  lastName: '',
  street: 'Main',
  houseNumber: '1',
  addressSupplement: '',
  plz: '12345',
  location: 'Berlin',
  country: 'Deutschland',
  email: '',
  phone: '',
};

vi.mock('./ApplicantFormStep', () => ({
  ApplicantFormStep: (props: {
    onSubmit: (values: ApplicantStepValues) => void;
  }) => (
    <button type="button" onClick={() => props.onSubmit(applicantValues)}>
      submit-applicant
    </button>
  ),
}));

// Start the wizard on step 2 so the applicant submit is reachable.
vi.mock('./formReducer', async () => {
  const actual =
    await vi.importActual<typeof FormReducerModule>('./formReducer');
  return {
    ...actual,
    getInitialFormState: (defaults: FormDefaults) => ({
      ...actual.getInitialFormState(defaults),
      currentStep: 2 as const,
    }),
  };
});

const renderContent = () =>
  render(
    <CreateProjectFormContent
      defaultProjectTypeId="type-1"
      projectTypes={[{ id: 'type-1', name: 'Type A' }]}
      projectTypesLoadFailed={false}
      onOpenChange={vi.fn()}
    />,
  );

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.mutate.mockClear();
  mocks.isPending = false;
});

describe('CreateProjectFormContent create submit', () => {
  it('submits the create mutation when not pending', async () => {
    const user = userEvent.setup();
    renderContent();

    await user.click(screen.getByText('submit-applicant'));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });

  it('does not re-submit while the create mutation is pending', async () => {
    mocks.isPending = true;
    const user = userEvent.setup();
    renderContent();

    await user.click(screen.getByText('submit-applicant'));
    await user.click(screen.getByText('submit-applicant'));

    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
