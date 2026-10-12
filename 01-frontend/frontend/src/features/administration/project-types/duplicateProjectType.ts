import {
  v1ProjectLogicCreateProjectTypes as createProjectTypes,
  v1ProjectLogicDeleteProjectTypes as deleteProjectTypes,
  type ProjectTypeResponse,
} from '@/api-clients/backend';

import { createCatalogUsecase } from '../data/usecaseApi';
import { loadCatalogUsecase } from '../catalog/usecaseQueries';
import { cloneUsecaseDocuments } from './cloneUsecaseDocuments';
import {
  PartialProjectTypeCloneError,
  ProjectTypeCloneDocumentsError,
} from './duplicateProjectType.errors';
import { readCreatedProjectType } from './projectTypeCreateResponse';

export type DuplicateProjectTypeInput = {
  source: ProjectTypeResponse;
  name: string;
};

const createActiveProjectType = async (name: string) => {
  const result = await createProjectTypes({
    body: [{ name }],
    throwOnError: true,
  });

  return readCreatedProjectType(result);
};

const deleteUnusedProjectType = async (id: string) => {
  await deleteProjectTypes({
    query: { ids: [id] },
    throwOnError: true,
  });
};

const resolveRejectedCatalogCreate = async (options: {
  created: ProjectTypeResponse;
  documentError: unknown;
}): Promise<ProjectTypeResponse> => {
  const { created, documentError } = options;
  let verification: Awaited<ReturnType<typeof loadCatalogUsecase>>;

  try {
    verification = await loadCatalogUsecase(created.id);
  } catch (verificationError) {
    throw new PartialProjectTypeCloneError({
      projectTypeId: created.id,
      projectTypeName: created.name,
      cause: verificationError,
    });
  }

  if (verification.kind === 'ready') {
    return created;
  }

  try {
    await deleteUnusedProjectType(created.id);
  } catch {
    throw new PartialProjectTypeCloneError({
      projectTypeId: created.id,
      projectTypeName: created.name,
      cause: documentError,
    });
  }

  throw new ProjectTypeCloneDocumentsError(documentError);
};

/**
 * Duplicates a project type through the existing project-type and use-case
 * APIs. The source catalog must already exist; a missing catalog fails before
 * any create so the UI never reports a complete duplicate of an incomplete
 * object. After an ambiguous rejected catalog POST, a follow-up read verifies
 * whether all four documents committed before cleanup is considered.
 */
export const duplicateProjectType = async (
  input: DuplicateProjectTypeInput,
): Promise<ProjectTypeResponse> => {
  const sourceUsecase = await loadCatalogUsecase(input.source.id);
  if (sourceUsecase.kind === 'missing') {
    throw new Error('Project type catalog is missing');
  }

  const created = await createActiveProjectType(input.name);

  try {
    await createCatalogUsecase(
      cloneUsecaseDocuments(sourceUsecase.usecase, created),
    );
    return created;
  } catch (documentError) {
    return resolveRejectedCatalogCreate({ created, documentError });
  }
};
