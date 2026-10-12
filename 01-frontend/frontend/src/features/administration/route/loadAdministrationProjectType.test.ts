import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAdministrationProjectType } from './loadAdministrationProjectType';

const mocks = vi.hoisted(() => ({
  listProjectTypes: vi.fn(),
  notFound: vi.fn(() => new Error('Not Found')),
}));

vi.mock('@tanstack/react-router', () => ({
  notFound: () => mocks.notFound(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ProjectLogicListProjectTypes: (...args: unknown[]) =>
    mocks.listProjectTypes(...args),
}));

const fernstrasse = {
  id: 'type-1',
  name: 'Fernstraße',
  active: true,
};

describe('loadAdministrationProjectType', () => {
  beforeEach(() => {
    mocks.listProjectTypes.mockReset();
    mocks.notFound.mockClear();
  });

  it('returns the matching project type', async () => {
    mocks.listProjectTypes.mockResolvedValue({
      data: [fernstrasse],
    });

    await expect(loadAdministrationProjectType('type-1')).resolves.toEqual(
      fernstrasse,
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('uses not-found for an unknown or deleted id', async () => {
    mocks.listProjectTypes.mockResolvedValue({
      data: [fernstrasse],
    });

    await expect(loadAdministrationProjectType('missing')).rejects.toThrow(
      'Not Found',
    );
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});
