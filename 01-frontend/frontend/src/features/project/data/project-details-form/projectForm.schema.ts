import { z } from 'zod';
import { federalStateCodes, type FederalStateCode } from './federalStates';

export type ProjectStepValues = {
  name: string;
  projectTypeId: string;
  federalState: FederalStateCode | '';
  entryDate: string;
  internalProjectNumber: string;
};

export type ProjectDetailsValues = Omit<ProjectStepValues, 'federalState'>;

export type ApplicantStepValues = {
  company: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  addressSupplement: string;
  plz: string;
  location: string;
  country: string;
  email: string;
  phone: string;
};

const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const PROJECT_NAME_MAX_LENGTH = 125;

/** Mirrors the DOM `max="9999-12-31"` upper bound for the entry-date input. */
export const ENTRY_DATE_MAX = '9999-12-31';

/**
 * Validates that an ISO date string is well-formed (`YYYY-MM-DD`), refers to a
 * real calendar date, and does not exceed {@link ENTRY_DATE_MAX}.
 */
export function isValidEntryDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
  if (!isRealDate) {
    return false;
  }

  return value <= ENTRY_DATE_MAX;
}

export function createProjectSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('fieldRequired'))
      .max(PROJECT_NAME_MAX_LENGTH, t('projectNameTooLong'))
      .refine((value) => !EMOJI_REGEX.test(value), t('emojiNotAllowed')),
    projectTypeId: z.string().trim().min(1, t('fieldRequired')),
    federalState: z.enum(federalStateCodes, {
      message: t('fieldRequired'),
    }),
    entryDate: z
      .string()
      .trim()
      .min(1, t('fieldRequired'))
      .refine(
        (value) => value === '' || isValidEntryDate(value),
        t('entryDateInvalid'),
      ),
    internalProjectNumber: z.string().trim().min(1, t('fieldRequired')),
  });
}

export function createProjectDetailsSchema(t: (key: string) => string) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('fieldRequired'))
      .max(PROJECT_NAME_MAX_LENGTH, t('projectNameTooLong'))
      .refine((value) => !EMOJI_REGEX.test(value), t('emojiNotAllowed')),
    projectTypeId: z.string().trim().min(1, t('fieldRequired')),
    entryDate: z
      .string()
      .trim()
      .min(1, t('fieldRequired'))
      .refine(
        (value) => value === '' || isValidEntryDate(value),
        t('entryDateInvalid'),
      ),
    internalProjectNumber: z.string().trim().min(1, t('fieldRequired')),
  });
}

export function createApplicantSchema(t: (key: string) => string) {
  return z.object({
    company: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    street: z.string().trim().min(1, t('fieldRequired')),
    houseNumber: z.string().trim().min(1, t('fieldRequired')),
    addressSupplement: z.string(),
    plz: z
      .string()
      .trim()
      .min(1, t('fieldRequired'))
      .regex(/^\d{5}$/, t('plzInvalid')),
    location: z.string().trim().min(1, t('fieldRequired')),
    country: z.string().trim().min(1, t('fieldRequired')),
    email: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || z.string().email().safeParse(value).success,
        t('emailInvalid'),
      ),
    phone: z.string(),
  });
}

export function getDefaultProjectValues(
  projectTypeId: string,
): ProjectStepValues {
  return {
    name: '',
    projectTypeId,
    federalState: '',
    entryDate: '',
    internalProjectNumber: '',
  };
}

/**
 * Builds the default applicant step values. The country default is resolved
 * through i18n (`step2.countryDefault`) so the prefilled label follows the
 * active UI language instead of a hard-coded German display string.
 */
export function getDefaultApplicantValues(
  t: (key: string) => string,
): ApplicantStepValues {
  return {
    company: '',
    firstName: '',
    lastName: '',
    street: '',
    houseNumber: '',
    addressSupplement: '',
    plz: '',
    location: '',
    country: t('step2.countryDefault'),
    email: '',
    phone: '',
  };
}
