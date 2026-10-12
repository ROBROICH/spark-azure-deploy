import type { ProjectTypeResponse } from '@/api-clients/backend';
import { projectTypeResponseArraySchema } from '@/features/project/data/project-types/projectType.schema';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Reads the created project-type record from the PLS create envelope or a bare
 * array. An empty successful payload is treated as a contract failure.
 */
export const readCreatedProjectType = (
  result: unknown,
): ProjectTypeResponse => {
  const payload = isRecord(result) && 'data' in result ? result.data : result;
  const created = projectTypeResponseArraySchema.parse(payload)[0];

  if (!created) {
    throw new Error('Project type create response is empty');
  }

  return created;
};
