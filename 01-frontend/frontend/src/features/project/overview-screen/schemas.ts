import {
  type ApplicantStepValues,
  type ProjectDetailsValues,
  createApplicantSchema,
  createProjectDetailsSchema,
} from '@/features/project/data/project-details-form/projectForm.schema';
import { z } from 'zod';

export type EditProjectValues = ProjectDetailsValues;

export type EditApplicantValues = ApplicantStepValues;

export function editProjectSchema(
  t: (key: string) => string,
  existingInternalProjectNumbers: Iterable<string> = [],
) {
  return createProjectDetailsSchema(t, existingInternalProjectNumbers);
}

export const editApplicantSchema = createApplicantSchema;

export type DeadlineFormValues = {
  deadlineType: string;
  startAt: string;
  endAt: string;
  legalBasis: string;
};

export function createDeadlineSchema(t: (key: string) => string) {
  return z
    .object({
      deadlineType: z.string().trim().min(1, t('Deadlines.form.fieldRequired')),
      startAt: z.string().trim().min(1, t('Deadlines.form.fieldRequired')),
      endAt: z.string().trim().min(1, t('Deadlines.form.fieldRequired')),
      legalBasis: z.string(),
    })
    .refine((values) => values.endAt >= values.startAt, {
      path: ['endAt'],
      message: t('Deadlines.form.endBeforeStart'),
    });
}

export const defaultDeadlineValues: DeadlineFormValues = {
  deadlineType: '',
  startAt: '',
  endAt: '',
  legalBasis: '',
};
