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

vi.mock('@/api-clients/backend/sdk.gen', () => ({
  v1IdentityGetCurrentIdentity: getIdentityMeGetMock,
}));

vi.mock('@/features/shared/config/startupEnv', () => ({
  getLocalDevCurrentUserEnv: getLocalDevCurrentUserEnvMock,
}));

describe('getCurrentUser', () => {
  beforeEach(() => {
    getIdentityMeGetMock.mockReset();
    getLocalDevCurrentUserEnvMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('in production builds', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', false);
      vi.stubEnv('VITE_DEV_API_MODE', '');
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
      vi.stubEnv('VITE_DEV_API_MODE', 'port-forwarding');
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

  describe('with the local Testing session proxy', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_DEV_API_MODE', 'session-proxy');
    });

    it('uses the authenticated backend identity and preserves the user role', async () => {
      const identity = {
        userId: 'testing-user',
        email: 'testing@example.test',
        firstName: 'Testing',
        lastName: 'User',
        role: 'user',
      };
      getIdentityMeGetMock.mockResolvedValue({ data: identity });

      await expect(getCurrentUser()).resolves.toEqual(identity);
      expect(getLocalDevCurrentUserEnvMock).not.toHaveBeenCalled();
    });

    it('does not fall back to a local admin when the Testing session fails', async () => {
      getIdentityMeGetMock.mockRejectedValue(new Error('Unauthorized'));

      await expect(getCurrentUser()).rejects.toThrow(CurrentUserLoadError);
      expect(getLocalDevCurrentUserEnvMock).not.toHaveBeenCalled();
    });
  });

  it('tags current-user query failures with sanitized feature metadata', () => {
    expect(getCurrentUserQueryOptions().meta).toEqual({
      area: 'access-control',
      operation: 'load-current-user',
    });
  });
});
