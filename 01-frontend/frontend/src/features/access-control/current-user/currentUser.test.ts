import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CurrentUserLoadError,
  getCurrentUser,
  getCurrentUserQueryOptions,
} from './currentUser';

const { getIdentityMeGetMock, getLocalDevCurrentUserEnvMock } = vi.hoisted(
  () => ({
    getIdentityMeGetMock: vi.fn(),
    getLocalDevCurrentUserEnvMock: vi.fn(),
  }),
);

vi.mock('@/api-clients/identity-management-module/sdk.gen', () => ({
  getIdentityMeGet: getIdentityMeGetMock,
}));

vi.mock('@/features/shared/config/startupEnv', () => ({
  getLocalDevCurrentUserEnv: getLocalDevCurrentUserEnvMock,
}));

describe('getCurrentUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('in production builds', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', false);
      getIdentityMeGetMock.mockReset();
    });

    it("passes through the 'user' role unchanged", async () => {
      getIdentityMeGetMock.mockResolvedValue({
        data: {
          userId: 'user-1',
          email: 'user@example.com',
          firstName: null,
          lastName: null,
          role: 'user',
        },
      });

      const result = await getCurrentUser();

      expect(result.role).toBe('user');
      expect(getIdentityMeGetMock).toHaveBeenCalledWith({
        throwOnError: true,
      });
    });

    it.each([
      { apiRole: 'service' as const, label: "the backend-only 'service' role" },
      { apiRole: null, label: 'a null role' },
      { apiRole: undefined, label: 'a missing role' },
    ])('fails closed for $label', async ({ apiRole }) => {
      getIdentityMeGetMock.mockResolvedValue({
        data: {
          userId: 'user-1',
          email: 'user@example.com',
          firstName: null,
          lastName: null,
          role: apiRole,
        },
      });

      await expect(getCurrentUser()).rejects.toThrow(CurrentUserLoadError);
    });

    it('sanitizes backend load failures before they reach query reporting', async () => {
      getIdentityMeGetMock.mockRejectedValue(new Error('raw backend details'));

      await expect(getCurrentUser()).rejects.toThrow(
        new CurrentUserLoadError(),
      );
      await expect(getCurrentUser()).rejects.not.toThrow('raw backend details');
    });

    it('preserves identity fields alongside the resolved role', async () => {
      getIdentityMeGetMock.mockResolvedValue({
        data: {
          userId: 'user-1',
          email: 'user@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'admin' as const,
        },
      });

      const result = await getCurrentUser();

      expect(result).toEqual({
        userId: 'user-1',
        email: 'user@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'admin',
      });
    });
  });

  describe('in development builds', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true);
      getIdentityMeGetMock.mockReset();
      getLocalDevCurrentUserEnvMock.mockReturnValue({
        userId: 'dev-user',
        email: 'dev@example.com',
        firstName: 'Dev',
        lastName: 'User',
      });
    });

    it('returns the local dev identity with the admin role', async () => {
      const result = await getCurrentUser();

      expect(result).toEqual({
        userId: 'dev-user',
        email: 'dev@example.com',
        firstName: 'Dev',
        lastName: 'User',
        role: 'admin',
      });
      expect(getIdentityMeGetMock).not.toHaveBeenCalled();
      expect(getLocalDevCurrentUserEnvMock).toHaveBeenCalledTimes(1);
    });
  });

  it('tags current-user query failures with sanitized feature metadata', () => {
    expect(getCurrentUserQueryOptions().meta).toEqual({
      area: 'access-control',
      operation: 'load-current-user',
    });
  });
});
