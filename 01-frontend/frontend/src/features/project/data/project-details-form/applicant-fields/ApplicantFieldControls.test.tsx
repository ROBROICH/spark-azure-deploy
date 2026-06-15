import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicantInputControl } from './ApplicantFieldControls';

describe('ApplicantInputControl', () => {
  afterEach(() => {
    cleanup();
  });

  it('sets autocomplete from field name when not passed explicitly', () => {
    const field = {
      name: 'firstName',
      state: { value: '', meta: { errors: [], isTouched: false } },
      handleBlur: vi.fn(),
      handleChange: vi.fn(),
    };

    render(<ApplicantInputControl field={field} label="Vorname" />);

    expect(screen.getByLabelText('Vorname').getAttribute('autocomplete')).toBe(
      'given-name',
    );
  });

  it('links validation errors to the input with aria-describedby', () => {
    const field = {
      name: 'plz',
      state: {
        value: '12',
        meta: { errors: [{ message: 'PLZ ungültig' }], isTouched: true },
      },
      handleBlur: vi.fn(),
      handleChange: vi.fn(),
    };

    render(<ApplicantInputControl field={field} label="PLZ" required />);

    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('plz-error');
    expect(document.getElementById('plz-error')?.textContent).toBe(
      'PLZ ungültig',
    );
  });

  it('keeps the hidden label available as the input accessible name', () => {
    const field = {
      name: 'email',
      state: { value: '', meta: { errors: [], isTouched: false } },
      handleBlur: vi.fn(),
      handleChange: vi.fn(),
    };

    render(<ApplicantInputControl field={field} label="E-Mail" hideLabel />);

    expect(screen.getByLabelText('E-Mail').getAttribute('id')).toBe('email');
  });

  it('allows explicit autocomplete override', () => {
    const field = {
      name: 'firstName',
      state: { value: '', meta: { errors: [], isTouched: false } },
      handleBlur: vi.fn(),
      handleChange: vi.fn(),
    };

    render(
      <ApplicantInputControl
        field={field}
        label="Vorname"
        autoComplete="off"
      />,
    );

    expect(screen.getByLabelText('Vorname').getAttribute('autocomplete')).toBe(
      'off',
    );
  });
});
