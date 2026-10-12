import { createProjectDetailsSchema } from '@/features/project/data/project-details-form/projectForm.schema';
import { describe, expect, it } from 'vitest';
import { createDeadlineSchema, editApplicantSchema } from './schemas';

const t = (key: string) => key;

describe('createDeadlineSchema', () => {
  const schema = createDeadlineSchema(t);

  it('accepts a deadline whose end date matches the start date', () => {
    const result = schema.safeParse({
      deadlineType: 'Einwendungsfrist',
      startAt: '2026-04-10',
      endAt: '2026-04-10',
      legalBasis: '',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a deadline whose end date is before the start date', () => {
    const result = schema.safeParse({
      deadlineType: 'Einwendungsfrist',
      startAt: '2026-04-10',
      endAt: '2026-04-09',
      legalBasis: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['endAt'],
            message: 'Deadlines.form.endBeforeStart',
          }),
        ]),
      );
    }
  });
});

describe('project details entry date validation', () => {
  const validProjectValues = {
    name: 'Verfahren',
    projectTypeId: 'type-1',
    entryDate: '2026-04-10',
    internalProjectNumber: 'AZ-001',
  };

  it('rejects malformed project entry dates', () => {
    const schema = createProjectDetailsSchema(t);
    const result = schema.safeParse({
      ...validProjectValues,
      entryDate: '2026-02-31',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['entryDate'],
            message: 'entryDateInvalid',
          }),
        ]),
      );
    }
  });
});

describe('editApplicantSchema', () => {
  const validApplicantValues = {
    company: '',
    firstName: '',
    lastName: '',
    street: 'Main Street',
    houseNumber: '1',
    addressSupplement: '',
    plz: '12345',
    location: 'Berlin',
    country: 'Deutschland',
    email: 'person@example.test',
    phone: '',
  };

  it('rejects invalid applicant email values', () => {
    const schema = editApplicantSchema(t);
    const result = schema.safeParse({
      ...validApplicantValues,
      email: 'not-an-email',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['email'],
            message: 'emailInvalid',
          }),
        ]),
      );
    }
  });

  it('rejects a missing applicant country', () => {
    const schema = editApplicantSchema(t);
    const result = schema.safeParse({
      ...validApplicantValues,
      country: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['country'],
            message: 'fieldRequired',
          }),
        ]),
      );
    }
  });
});
