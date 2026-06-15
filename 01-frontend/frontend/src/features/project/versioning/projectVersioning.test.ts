import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMountedProjectIds,
  getProjectLatestVersion,
} from './projectVersioning';

const mocks = vi.hoisted(() => ({
  getRegisteredRouter: vi.fn(),
}));

vi.mock('@/integrations/router/registeredRouter', () => ({
  getRegisteredRouter: () => mocks.getRegisteredRouter(),
}));

describe('getProjectLatestVersion', () => {
  it('returns the version for valid non-negative integers', () => {
    expect(getProjectLatestVersion({ latestVersion: 0 })).toBe(0);
    expect(getProjectLatestVersion({ latestVersion: 7 })).toBe(7);
  });

  it('throws on a non-integer version', () => {
    expect(() => getProjectLatestVersion({ latestVersion: 1.5 })).toThrow();
  });

  it('throws on a negative version', () => {
    expect(() => getProjectLatestVersion({ latestVersion: -1 })).toThrow();
  });

  it('throws on NaN', () => {
    expect(() =>
      getProjectLatestVersion({ latestVersion: Number.NaN }),
    ).toThrow();
  });
});

describe('getMountedProjectIds', () => {
  beforeEach(() => {
    mocks.getRegisteredRouter.mockReset();
  });

  it('fails closed with an empty set when no router is registered', () => {
    mocks.getRegisteredRouter.mockReturnValue(null);

    expect(getMountedProjectIds().size).toBe(0);
  });

  it('collects the verfahrenId of every mounted match', () => {
    mocks.getRegisteredRouter.mockReturnValue({
      state: {
        matches: [
          { params: { verfahrenId: 'project-1' } },
          { params: { verfahrenId: 'project-2' } },
        ],
      },
    });

    expect([...getMountedProjectIds()]).toEqual(['project-1', 'project-2']);
  });

  it('ignores matches without a valid string verfahrenId', () => {
    mocks.getRegisteredRouter.mockReturnValue({
      state: {
        matches: [
          { params: {} },
          { params: { verfahrenId: '' } },
          { params: { verfahrenId: 42 } },
          { params: { verfahrenId: 'project-3' } },
        ],
      },
    });

    expect([...getMountedProjectIds()]).toEqual(['project-3']);
  });
});
