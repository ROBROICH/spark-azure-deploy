import type { ProjectResponse } from '@/api-clients/backend';
import { z } from 'zod';

const germanStateValues = [
  'Bayern',
  'Baden-Württemberg',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
] as const;

const germanStateSchema = z.enum(germanStateValues);

export const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectTypeId: z.string(),
  projectTypeName: z.string(),
  createdById: z.string(),
  entryDate: z.string(),
  internalProjectNumber: z.string(),
  state: germanStateSchema.nullable(),
  imported: z.boolean().nullable(),
  owners: z.array(z.string()),
  members: z.array(z.string()),
  auditors: z.array(z.string()),
  salutation: z.string().nullable(),
  company: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  street: z.string().nullable(),
  houseNumber: z.string().nullable(),
  addressSupplement: z.string().nullable(),
  plz: z.string().nullable(),
  location: z.string().nullable(),
  country: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  fax: z.string().nullable(),
  statusId: z.string(),
  statusName: z.string(),
  currentProcessStepId: z.string().nullable(),
  createdAt: z.string(),
  originalCreatedAt: z.string(),
  updatedAt: z.string(),
  projectVersion: z.number(),
  latestVersion: z.number(),
}) satisfies z.ZodType<ProjectResponse>;

export const projectResponseArraySchema = z.array(projectResponseSchema);
