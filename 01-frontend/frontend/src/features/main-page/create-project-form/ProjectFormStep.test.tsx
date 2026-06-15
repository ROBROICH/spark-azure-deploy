import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectFormStep } from './ProjectFormStep';
import {
  PROJECT_NAME_MAX_LENGTH,
  type ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
});

const validValues: ProjectStepValues = {
  name: 'Test project',
  projectTypeId: 'type-1',
  federalState: 'BY',
  entryDate: '2024-01-15',
  internalProjectNumber: 'AZ-001',
};

const emptyValues: ProjectStepValues = {
  name: '',
  projectTypeId: 'type-1',
  federalState: 'BY',
  entryDate: '',
  internalProjectNumber: '',
};

const projectTypes = [{ id: 'type-1', name: 'Type A' }];

describe('ProjectFormStep validation timing', () => {
  it('limits the project name input to the shared max length', () => {
    render(
      <ProjectFormStep
        defaultValues={validValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/step1\.projectName/)).toHaveAttribute(
      'maxLength',
      String(PROJECT_NAME_MAX_LENGTH),
    );
  });

  it('does not show validation errors on blur before the first submit attempt', () => {
    render(
      <ProjectFormStep
        defaultValues={emptyValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.blur(screen.getByLabelText(/step1\.antrageingang/));

    expect(screen.queryByText('fieldRequired')).not.toBeInTheDocument();
  });

  it('shows submit errors and clears the corrected date field on change', async () => {
    const { container } = render(
      <ProjectFormStep
        defaultValues={emptyValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    const form = container.querySelector('#add-project-step1-form');
    fireEvent.submit(form as HTMLFormElement);

    const entryDate = screen.getByLabelText(/step1\.antrageingang/);
    await waitFor(() => {
      expect(entryDate).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.change(entryDate, { target: { value: '2024-01-15' } });

    await waitFor(() => {
      expect(entryDate).toHaveAttribute('aria-invalid', 'false');
    });
  });
});

describe('ProjectFormStep duplicate-check gate', () => {
  it('does not advance on native form submit while the dependency is blocked', () => {
    const onSubmit = vi.fn();

    const { container } = render(
      <ProjectFormStep
        defaultValues={validValues}
        projectTypes={projectTypes}
        disableSubmit
        onSubmit={onSubmit}
      />,
    );

    // Native submit (e.g. Enter) bypasses the disabled footer button, so the
    // gate must be enforced inside the form's submit path.
    const form = container.querySelector('#add-project-step1-form');
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks the parent-triggered submit handle while the dependency is blocked', () => {
    const onSubmit = vi.fn();
    const exposed: { submit: (() => void) | null } = { submit: null };

    render(
      <ProjectFormStep
        defaultValues={validValues}
        projectTypes={projectTypes}
        disableSubmit
        onSubmit={onSubmit}
        onFormReady={(methods) => {
          exposed.submit = methods.submit;
        }}
      />,
    );

    exposed.submit?.();

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('advances on native form submit once the dependency is ready', async () => {
    const onSubmit = vi.fn();

    const { container } = render(
      <ProjectFormStep
        defaultValues={validValues}
        projectTypes={projectTypes}
        disableSubmit={false}
        onSubmit={onSubmit}
      />,
    );

    const form = container.querySelector('#add-project-step1-form');
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ internalProjectNumber: 'AZ-001' }),
    );
  });
});
