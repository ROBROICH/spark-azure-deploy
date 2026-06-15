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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('ApplicantFormStep validation timing', () => {
  it('does not show validation errors on blur before the first submit attempt', () => {
    render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    fireEvent.blur(screen.getByLabelText(/step2\.street/));

    expect(screen.queryByText('fieldRequired')).not.toBeInTheDocument();
  });

  it('shows submit errors and clears the corrected street field on change', async () => {
    const { container } = render(
      <ApplicantFormStep defaultValues={emptyValues} onSubmit={vi.fn()} />,
    );

    const form = container.querySelector('#add-project-step2-form');
    fireEvent.submit(form as HTMLFormElement);

    const street = screen.getByLabelText(/step2\.street/);
    await waitFor(() => {
      expect(street).toHaveAttribute('aria-invalid', 'true');
    });

    fireEvent.change(street, { target: { value: 'Main' } });

    await waitFor(() => {
      expect(street).toHaveAttribute('aria-invalid', 'false');
    });
  });
});
