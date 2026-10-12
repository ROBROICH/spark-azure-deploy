import { v1ProjectLogicListProjectTypes as listProjectTypes } from '@/api-clients/backend';
import { projectTypeResponseArraySchema } from '@/features/project/data/project-types/projectType.schema';
import { notFound } from '@tanstack/react-router';

/**
 * Resolves one project type for the administration detail route. Unknown or
 * deleted ids use the shared not-found UX instead of rendering an empty editor.
 */
export const loadAdministrationProjectType = async (projectTypeId: string) => {
  const { data } = await listProjectTypes({ throwOnError: true });
  const projectTypes = projectTypeResponseArraySchema.parse(data);
  const projectType = projectTypes.find((item) => item.id === projectTypeId);

  if (!projectType) {
    throw notFound();
  }

  return projectType;
};
