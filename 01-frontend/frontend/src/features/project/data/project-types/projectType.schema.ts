import type { ProjectTypeResponse } from '@/api-clients/backend';
import { z } from 'zod';

export const projectTypeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
}) satisfies z.ZodType<ProjectTypeResponse>;

export const projectTypeResponseArraySchema = z.array(
  projectTypeResponseSchema,
);
