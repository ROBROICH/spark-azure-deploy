import type { ProjectResponse } from '@/api-clients/pls-module';
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
  state: germanStateSchema.nullish(),
  imported: z.boolean().nullish(),
  owners: z.array(z.string()).optional(),
  members: z.array(z.string()).optional(),
  auditors: z.array(z.string()).optional(),
  salutation: z.string().nullish(),
  company: z.string().nullish(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  street: z.string().nullish(),
  houseNumber: z.string().nullish(),
  addressSupplement: z.string().nullish(),
  plz: z.string().nullish(),
  location: z.string().nullish(),
  country: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  fax: z.string().nullish(),
  statusId: z.string(),
  statusName: z.string(),
  currentProcessStepId: z.string().nullish(),
  createdAt: z.string(),
  originalCreatedAt: z.string(),
  updatedAt: z.string(),
  projectVersion: z.number(),
  latestVersion: z.number(),
}) satisfies z.ZodType<ProjectResponse>;

export const projectResponseArraySchema = z.array(projectResponseSchema);
