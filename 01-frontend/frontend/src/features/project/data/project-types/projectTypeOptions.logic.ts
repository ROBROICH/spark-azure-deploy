import type { ProjectTypeResponse } from '@/api-clients/backend';

export const selectActiveProjectTypes = (
  projectTypes: ReadonlyArray<ProjectTypeResponse>,
): ProjectTypeResponse[] => projectTypes.filter((type) => type.active);

export const toEditableProjectTypeItems = (
  projectTypes: ReadonlyArray<ProjectTypeResponse>,
  currentTypeId: string,
  inactiveLabel: (name: string) => string,
): { value: string; label: string }[] =>
  projectTypes
    .filter((type) => type.active || type.id === currentTypeId)
    .map((type) => ({
      value: type.id,
      label: type.active ? type.name : inactiveLabel(type.name),
    }));
