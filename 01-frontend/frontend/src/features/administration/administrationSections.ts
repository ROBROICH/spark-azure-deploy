import { z } from 'zod';

export const ADMINISTRATION_SECTION_VALUES = [
  'catalog',
  'required-documents',
  'decision-template',
] as const;

export type AdministrationSection =
  (typeof ADMINISTRATION_SECTION_VALUES)[number];

export const administrationDetailSearchSchema = z.object({
  section: z
    .enum(ADMINISTRATION_SECTION_VALUES)
    .catch('catalog')
    .default('catalog'),
});
