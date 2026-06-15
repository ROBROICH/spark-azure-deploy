import type { ProjectTypeResponse } from '@/api-clients/pls-module';
import { z } from 'zod';

const projectTypeResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
}) satisfies z.ZodType<ProjectTypeResponse>;

export const projectTypeResponseArraySchema = z.array(
  projectTypeResponseSchema,
);
