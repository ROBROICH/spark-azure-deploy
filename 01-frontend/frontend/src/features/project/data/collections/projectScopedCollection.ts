import { parseLoadSubsetOptions } from '@tanstack/query-db-collection';

export const getProjectIdFromCollectionOptions = (
  opts?: Record<string, unknown>,
): string => {
  const parsed = parseLoadSubsetOptions(opts ?? {});
  const filter = parsed.filters.find((f) => f.field.join('.') === 'projectId');
  return (filter?.value as string | undefined) ?? '';
};

export const getProjectScopedCollectionQueryKey = (
  collectionId: string,
  opts?: Record<string, unknown>,
): [string] | [string, string] => {
  const projectId = getProjectIdFromCollectionOptions(opts);
  return projectId ? [collectionId, projectId] : [collectionId];
};

export const extractProjectIdFromLoadSubsetOptions =
  getProjectIdFromCollectionOptions;

export const getProjectScopedQueryKey = (
  collectionId: string,
  projectId: string,
): [string] | [string, string] =>
  projectId ? [collectionId, projectId] : [collectionId];
