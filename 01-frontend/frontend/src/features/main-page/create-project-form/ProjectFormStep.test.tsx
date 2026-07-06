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

const translations: Record<string, string> = {
  'required.entryDate': 'Entry date is required.',
  'required.federalState': 'Federal state is required.',
  'required.internalProjectNumber': 'File reference number is required.',
  'required.projectName': 'Project name is required.',
  'required.projectType': 'Type is required.',
  'step1.aktenzeichen': 'File reference number',
  'step1.antrageingang': 'Entry date',
  'step1.federalState': 'Federal state',
  'step1.projectName': 'Project name',
  'step1.selectType': 'Select type',
  'step1.type': 'Type',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
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

const allEmptyValues: ProjectStepValues = {
  name: '',
  projectTypeId: '',
  federalState: '',
  entryDate: '',
  internalProjectNumber: '',
};

const missingProjectTypeValues: ProjectStepValues = {
  ...validValues,
  projectTypeId: '',
};

const projectTypes = [{ id: 'type-1', name: 'Type A' }];

function getProjectForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(
    '#add-project-step1-form',
  );
  if (!form) {
    throw new Error('Expected project form to be rendered.');
  }
  return form;
}

describe('ProjectFormStep validation timing', () => {
  it('limits the project name input to the shared max length', () => {
    render(
      <ProjectFormStep
        defaultValues={validValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Project name/)).toHaveAttribute(
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

    fireEvent.blur(screen.getByLabelText(/Entry date/));

    expect(
      screen.queryByText('Entry date is required.'),
    ).not.toBeInTheDocument();
  });

  it('shows submit errors and clears the corrected date field on change', async () => {
    const { container } = render(
      <ProjectFormStep
        defaultValues={emptyValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.submit(getProjectForm(container));

    const entryDate = screen.getByLabelText(/Entry date/);
    await waitFor(() => {
      expect(entryDate).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.change(entryDate, { target: { value: '2024-01-15' } });

    await waitFor(() => {
      expect(entryDate).toHaveAttribute('aria-invalid', 'false');
    });
  });

  it('focuses the first invalid field and shows field-specific required errors', async () => {
    const { container } = render(
      <ProjectFormStep
        defaultValues={allEmptyValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.submit(getProjectForm(container));

    const projectName = screen.getByLabelText(/Project name/);
    await waitFor(() => {
      expect(projectName).toHaveFocus();
    });

    expect(screen.getByText('Project name is required.')).toBeInTheDocument();
    expect(screen.getByText('Type is required.')).toBeInTheDocument();
    expect(screen.getByText('Federal state is required.')).toBeInTheDocument();
    expect(screen.getByText('Entry date is required.')).toBeInTheDocument();
    expect(
      screen.getByText('File reference number is required.'),
    ).toBeInTheDocument();
  });

  it('keeps an unchanged focused field linked to its error without a local alert', async () => {
    const { container } = render(
      <ProjectFormStep
        defaultValues={allEmptyValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.submit(getProjectForm(container));

    const projectName = screen.getByLabelText(/Project name/);
    const projectNameError = await screen.findByText(
      'Project name is required.',
    );

    fireEvent.focus(projectName);
    fireEvent.blur(projectName);

    expect(projectNameError).toBeInTheDocument();
    expect(projectNameError).not.toHaveAttribute('role');
    expect(projectName).toHaveAttribute(
      'aria-describedby',
      projectNameError.id,
    );
  });

  it('focuses the invalid project type select when it is the first invalid control', async () => {
    const { container } = render(
      <ProjectFormStep
        defaultValues={missingProjectTypeValues}
        projectTypes={projectTypes}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.submit(getProjectForm(container));

    const projectType = screen.getByRole('combobox', { name: /Type/ });
    await waitFor(() => {
      expect(projectType).toHaveFocus();
    });

    const projectTypeError = screen.getByText('Type is required.');
    expect(projectTypeError).not.toHaveAttribute('role');
    expect(projectType).toHaveAttribute(
      'aria-describedby',
      projectTypeError.id,
    );
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
    fireEvent.submit(getProjectForm(container));

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

    fireEvent.submit(getProjectForm(container));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ internalProjectNumber: 'AZ-001' }),
    );
  });
});
