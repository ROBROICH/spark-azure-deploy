import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApplicantFormStep,
  type ApplicantStepValues,
} from './ApplicantFormStep';

const translations: Record<string, string> = {
  'required.country': 'Country is required.',
  'required.houseNumber': 'House number is required.',
  'required.location': 'City is required.',
  'required.plz': 'Postal code is required.',
  'required.street': 'Street is required.',
  'step2.addressSupplement': 'Address supplement',
  'step2.company': 'Company',
  'step2.country': 'Country',
  'step2.email': 'Email',
  'step2.firstName': 'First name',
  'step2.houseNumber': 'House number',
  'step2.lastName': 'Last name',
  'step2.location': 'City',
  'step2.phone': 'Phone',
  'step2.plz': 'Postal code',
  'step2.street': 'Street',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

afterEach(() => {
  cleanup();
});

const emptyValues: ApplicantStepValues = {
  company: '',
  firstName: '',
  lastName: '',
  street: '',
  houseNumber: '',
  addressSupplement: '',
  plz: '',
  location: '',
  country: '',
  email: '',
  phone: '',
};

function getApplicantForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>(
    '#add-project-step2-form',
  );
  if (!form) {
    throw new Error('Expected applicant form to be rendered.');
  }
  return form;
}

describe('ApplicantFormStep validation timing', () => {
  it('does not show validation errors on blur before the first submit attempt', () => {
    render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    fireEvent.blur(screen.getByLabelText(/Street/));

    expect(screen.queryByText('Street is required.')).not.toBeInTheDocument();
  });

  it('shows submit errors and clears the corrected street field on change', async () => {
    const { container } = render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    fireEvent.submit(getApplicantForm(container));

    const street = screen.getByLabelText(/Street/);
    await waitFor(() => {
      expect(street).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.change(street, { target: { value: 'Main' } });

    await waitFor(() => {
      expect(street).toHaveAttribute('aria-invalid', 'false');
    });
  });

  it('focuses the first invalid applicant field and shows field-specific required errors', async () => {
    const { container } = render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    fireEvent.submit(getApplicantForm(container));

    const street = screen.getByLabelText(/Street/);
    await waitFor(() => {
      expect(street).toHaveFocus();
    });

    expect(screen.getByText('Street is required.')).toBeInTheDocument();
    expect(screen.getByText('House number is required.')).toBeInTheDocument();
    expect(screen.getByText('Postal code is required.')).toBeInTheDocument();
    expect(screen.getByText('City is required.')).toBeInTheDocument();
    expect(screen.getByText('Country is required.')).toBeInTheDocument();
  });

  it('keeps an unchanged focused field linked to its error without a local alert', async () => {
    const { container } = render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    fireEvent.submit(getApplicantForm(container));

    const street = screen.getByLabelText(/Street/);
    const streetError = await screen.findByText('Street is required.');

    fireEvent.focus(street);
    fireEvent.blur(street);

    expect(streetError).toBeInTheDocument();
    expect(streetError).not.toHaveAttribute('role');
    expect(street).toHaveAttribute('aria-describedby', streetError.id);
  });
});
