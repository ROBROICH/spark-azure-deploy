import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Usecase } from '../data/usecaseApi';
import { duplicateProjectType } from './duplicateProjectType';
import {
  isPartialProjectTypeCloneError,
  isProjectTypeCloneDocumentsError,
} from './duplicateProjectType.errors';

const mocks = vi.hoisted(() => ({
  createCatalogUsecase: vi.fn(),
  createProjectTypes: vi.fn(),
  deleteProjectTypes: vi.fn(),
  loadCatalogUsecase: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ProjectLogicCreateProjectTypes: (...args: unknown[]) =>
    mocks.createProjectTypes(...args),
  v1ProjectLogicDeleteProjectTypes: (...args: unknown[]) =>
    mocks.deleteProjectTypes(...args),
}));

vi.mock('../data/usecaseApi', () => ({
  createCatalogUsecase: (...args: unknown[]) =>
    mocks.createCatalogUsecase(...args),
}));

vi.mock('../catalog/usecaseQueries', () => ({
  loadCatalogUsecase: (...args: unknown[]) => mocks.loadCatalogUsecase(...args),
}));

vi.mock('./cloneUsecaseDocuments', () => ({
  cloneUsecaseDocuments: (
    usecase: Usecase,
    projectType: { id: string; name: string },
  ) => ({
    projekttyp: projectType,
    gesetzesgrundlage: usecase.gesetzesgrundlage,
    dokumente: usecase.dokumente,
    beschluss: usecase.beschluss,
  }),
}));

const source = {
  id: 'source-type',
  name: 'Fernstraße',
  active: true,
};

const created = {
  id: 'new-type',
  name: 'Fernstraße Kopie',
  active: true,
};

const sourceUsecase = {
  slug: 'fernstrasse',
  updatedAt: '2026-01-01T00:00:00.000Z',
  projekttyp: { id: 'source-type', name: 'Fernstraße' },
  gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
  dokumente: { categories: [] },
  beschluss: { nodes: [] },
} satisfies Usecase;

describe('duplicateProjectType', () => {
  beforeEach(() => {
    mocks.createCatalogUsecase.mockReset();
    mocks.createProjectTypes.mockReset();
    mocks.deleteProjectTypes.mockReset();
    mocks.loadCatalogUsecase.mockReset();
    mocks.createProjectTypes.mockResolvedValue({ data: [created] });
    mocks.deleteProjectTypes.mockResolvedValue({ data: undefined });
    mocks.createCatalogUsecase.mockResolvedValue({ data: sourceUsecase });
  });

  it('creates the project type and cloned documents, then returns the new type', async () => {
    mocks.loadCatalogUsecase.mockResolvedValue({
      kind: 'ready',
      usecase: sourceUsecase,
    });

    await expect(
      duplicateProjectType({ source, name: 'Fernstraße Kopie' }),
    ).resolves.toEqual(created);

    expect(mocks.createProjectTypes).toHaveBeenCalledWith({
      body: [{ name: 'Fernstraße Kopie' }],
      throwOnError: true,
    });
    expect(mocks.createCatalogUsecase).toHaveBeenCalledWith({
      projekttyp: created,
      gesetzesgrundlage: sourceUsecase.gesetzesgrundlage,
      dokumente: sourceUsecase.dokumente,
      beschluss: sourceUsecase.beschluss,
    });
    expect(mocks.deleteProjectTypes).not.toHaveBeenCalled();
  });

  it('rejects a missing source catalog before creating anything', async () => {
    mocks.loadCatalogUsecase.mockResolvedValue({ kind: 'missing' });

    await expect(
      duplicateProjectType({ source, name: 'Fernstraße Kopie' }),
    ).rejects.toThrow('Project type catalog is missing');

    expect(mocks.createProjectTypes).not.toHaveBeenCalled();
    expect(mocks.createCatalogUsecase).not.toHaveBeenCalled();
    expect(mocks.deleteProjectTypes).not.toHaveBeenCalled();
  });

  it('deletes the unused project type when document creation fails', async () => {
    mocks.loadCatalogUsecase
      .mockResolvedValueOnce({
        kind: 'ready',
        usecase: sourceUsecase,
      })
      .mockResolvedValueOnce({ kind: 'missing' });
    mocks.createCatalogUsecase.mockRejectedValue(new Error('catalog failed'));

    const result = duplicateProjectType({
      source,
      name: 'Fernstraße Kopie',
    });

    await expect(result).rejects.toSatisfy(isProjectTypeCloneDocumentsError);
    expect(mocks.deleteProjectTypes).toHaveBeenCalledWith({
      query: { ids: ['new-type'] },
      throwOnError: true,
    });
  });

  it('reports the partial project type when cleanup also fails', async () => {
    mocks.loadCatalogUsecase
      .mockResolvedValueOnce({
        kind: 'ready',
        usecase: sourceUsecase,
      })
      .mockResolvedValueOnce({ kind: 'missing' });
    mocks.createCatalogUsecase.mockRejectedValue(new Error('catalog failed'));
    mocks.deleteProjectTypes.mockRejectedValue(new Error('delete failed'));

    try {
      await duplicateProjectType({ source, name: 'Fernstraße Kopie' });
      throw new Error('expected partial clone error');
    } catch (error) {
      expect(isPartialProjectTypeCloneError(error)).toBe(true);
      if (!isPartialProjectTypeCloneError(error)) {
        return;
      }
      expect(error.projectTypeId).toBe('new-type');
      expect(error.projectTypeName).toBe('Fernstraße Kopie');
    }
  });

  it('treats the clone as complete when verification finds a committed catalog', async () => {
    mocks.loadCatalogUsecase
      .mockResolvedValueOnce({
        kind: 'ready',
        usecase: sourceUsecase,
      })
      .mockResolvedValueOnce({
        kind: 'ready',
        usecase: {
          ...sourceUsecase,
          projekttyp: created,
        },
      });
    mocks.createCatalogUsecase.mockRejectedValue(
      new Error('response was lost'),
    );

    await expect(
      duplicateProjectType({ source, name: 'Fernstraße Kopie' }),
    ).resolves.toEqual(created);

    expect(mocks.loadCatalogUsecase).toHaveBeenLastCalledWith('new-type');
    expect(mocks.deleteProjectTypes).not.toHaveBeenCalled();
  });

  it('keeps the project type recoverable when catalog verification is indeterminate', async () => {
    const verificationError = new Error('verification unavailable');
    mocks.loadCatalogUsecase
      .mockResolvedValueOnce({
        kind: 'ready',
        usecase: sourceUsecase,
      })
      .mockRejectedValueOnce(verificationError);
    mocks.createCatalogUsecase.mockRejectedValue(
      new Error('response was lost'),
    );

    try {
      await duplicateProjectType({ source, name: 'Fernstraße Kopie' });
      throw new Error('expected partial clone error');
    } catch (error) {
      expect(isPartialProjectTypeCloneError(error)).toBe(true);
      expect(error).toMatchObject({
        projectTypeId: 'new-type',
        projectTypeName: 'Fernstraße Kopie',
        cause: verificationError,
      });
    }
    expect(mocks.deleteProjectTypes).not.toHaveBeenCalled();
  });
});
