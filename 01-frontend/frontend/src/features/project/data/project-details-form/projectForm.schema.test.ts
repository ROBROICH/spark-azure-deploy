import { describe, expect, it } from 'vitest';
import {
  ENTRY_DATE_MAX,
  PROJECT_NAME_MAX_LENGTH,
  createProjectDetailsSchema,
  createApplicantSchema,
  createProjectSchema,
  getDefaultApplicantValues,
  isValidEntryDate,
} from './projectForm.schema';

/** Identity translator so schema messages equal their keys in assertions. */
const t = (key: string) => key;

const baseProjectValues = {
  name: 'Test project',
  projectTypeId: 'type-1',
  federalState: 'BY' as const,
  entryDate: '2024-01-15',
  internalProjectNumber: 'AZ-001',
};

const baseApplicantValues = {
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

describe('isValidEntryDate', () => {
  it('accepts a well-formed real date within the max bound', () => {
    expect(isValidEntryDate('2024-02-29')).toBe(true);
    expect(isValidEntryDate(ENTRY_DATE_MAX)).toBe(true);
  });

  it('rejects malformed formats', () => {
    expect(isValidEntryDate('2024-1-5')).toBe(false);
    expect(isValidEntryDate('15.01.2024')).toBe(false);
    expect(isValidEntryDate('2024/01/15')).toBe(false);
    expect(isValidEntryDate('not-a-date')).toBe(false);
  });

  it('rejects calendar-invalid dates', () => {
    expect(isValidEntryDate('2023-02-29')).toBe(false);
    expect(isValidEntryDate('2024-13-01')).toBe(false);
    expect(isValidEntryDate('2024-00-10')).toBe(false);
    expect(isValidEntryDate('2024-04-31')).toBe(false);
  });

  it('rejects dates beyond the max bound', () => {
    expect(isValidEntryDate('10000-01-01')).toBe(false);
  });
});

describe('createProjectSchema entryDate', () => {
  it('rejects an empty entry date with the required message', () => {
    const result = createProjectSchema(t).safeParse({
      ...baseProjectValues,
      entryDate: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.filter((i) =>
        i.path.includes('entryDate'),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toBe('fieldRequired');
    }
  });

  it('rejects an empty project-details entry date with only the required message', () => {
    const result = createProjectDetailsSchema(t).safeParse({
      ...baseProjectValues,
      entryDate: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.filter((i) =>
        i.path.includes('entryDate'),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toBe('fieldRequired');
    }
  });

  it('rejects a malformed / out-of-range entry date with the invalid message', () => {
    for (const entryDate of ['15.01.2024', '2023-02-29', '10000-01-01']) {
      const result = createProjectSchema(t).safeParse({
        ...baseProjectValues,
        entryDate,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) =>
          i.path.includes('entryDate'),
        );
        expect(issue?.message).toBe('entryDateInvalid');
      }
    }
  });

  it('accepts a valid entry date', () => {
    const result = createProjectSchema(t).safeParse(baseProjectValues);
    expect(result.success).toBe(true);
  });
});

describe('project name length', () => {
  it('accepts names at the shared max length', () => {
    const result = createProjectSchema(t).safeParse({
      ...baseProjectValues,
      name: 'A'.repeat(PROJECT_NAME_MAX_LENGTH),
    });

    expect(result.success).toBe(true);
  });

  it('rejects names beyond the shared max length in create and edit schemas', () => {
    const longName = 'A'.repeat(PROJECT_NAME_MAX_LENGTH + 1);

    for (const schema of [
      createProjectSchema(t),
      createProjectDetailsSchema(t),
    ]) {
      const result = schema.safeParse({
        ...baseProjectValues,
        name: longName,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['name'],
              message: 'projectNameTooLong',
            }),
          ]),
        );
      }
    }
  });
});

describe('createApplicantSchema email', () => {
  it('rejects a malformed email', () => {
    for (const email of ['not-an-email', 'foo@', '@bar.de', 'a b@c.de']) {
      const result = createApplicantSchema(t).safeParse({
        ...baseApplicantValues,
        email,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path.includes('email'));
        expect(issue?.message).toBe('emailInvalid');
      }
    }
  });

  it('accepts an empty email (optional field)', () => {
    const result = createApplicantSchema(t).safeParse({
      ...baseApplicantValues,
      email: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid email', () => {
    const result = createApplicantSchema(t).safeParse({
      ...baseApplicantValues,
      email: 'antragsteller@example.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('getDefaultApplicantValues', () => {
  it('resolves the country default through i18n instead of hard-coded copy', () => {
    const translate = (key: string) =>
      key === 'step2.countryDefault' ? 'Germany' : key;

    expect(getDefaultApplicantValues(translate).country).toBe('Germany');
  });
});
