import type { IdentityResponse } from '@/api-clients/backend/types.gen';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_USER_ID } from '@/features/access-control/system-users/systemUsers';
import {
  isAssignableOrganizationUser,
  organizationUsersCollection,
} from './organizationUsers.collection';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn((options: object) => options),
  listIdentities: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1IdentityListIdentities: (...args: unknown[]) =>
    mocks.listIdentities(...args),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {},
}));

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => mocks.createCollection(options),
  useLiveQuery: vi.fn(),
}));

const collectionOptions = organizationUsersCollection as unknown as {
  getKey: (item: IdentityResponse) => string;
  queryFn: () => Promise<IdentityResponse[]>;
  schema: {
    parse: (value: unknown) => unknown;
  };
};

beforeEach(() => {
  mocks.listIdentities.mockReset();
});

describe('isAssignableOrganizationUser', () => {
  it.each([{ role: 'admin' as const }, { role: 'user' as const }])(
    'allows confirmed human $role identities',
    ({ role }) => {
      expect(
        isAssignableOrganizationUser({
          email: 'user@example.com',
          firstName: null,
          lastName: null,
          role,
          userId: 'user-1',
        }),
      ).toBe(true);
    },
  );

  it.each([
    { role: 'service' as const, label: 'service identities' },
    { role: null, label: 'null-role identities' },
  ])('filters out $label', ({ role }) => {
    expect(
      isAssignableOrganizationUser({
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role,
        userId: 'user-1',
      }),
    ).toBe(false);
  });

  it('filters out system identities even when they have a human role', () => {
    expect(
      isAssignableOrganizationUser({
        email: 'system@example.com',
        firstName: null,
        lastName: null,
        role: 'admin',
        userId: SYSTEM_USER_ID,
      }),
    ).toBe(false);
  });
});

describe('organizationUsersCollection', () => {
  it('loads users with throwOnError and filters to assignable human identities', async () => {
    const assignableUser = {
      email: 'user@example.com',
      firstName: null,
      lastName: null,
      role: 'user' as const,
      userId: 'user-1',
    };
    mocks.listIdentities.mockResolvedValue({
      data: {
        users: [
          assignableUser,
          {
            email: 'service@example.com',
            role: 'service',
            userId: 'service-1',
          },
          {
            email: 'missing-role@example.com',
            userId: 'missing-role-1',
          },
          {
            email: 'system@example.com',
            role: 'admin',
            userId: SYSTEM_USER_ID,
          },
        ],
      },
    });

    await expect(collectionOptions.queryFn()).resolves.toEqual([
      assignableUser,
    ]);
    expect(mocks.listIdentities).toHaveBeenCalledWith({
      throwOnError: true,
    });
  });

  it('surfaces organization-user query errors', async () => {
    const error = new Error('identity backend failed');
    mocks.listIdentities.mockRejectedValue(error);

    await expect(collectionOptions.queryFn()).rejects.toBe(error);
  });

  it('uses user ids as collection keys', () => {
    expect(
      collectionOptions.getKey({
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role: 'user',
        userId: 'user-1',
      }),
    ).toBe('user-1');
  });

  it('accepts only schema-valid assignable organization users', () => {
    expect(
      collectionOptions.schema.parse({
        email: 'admin@example.com',
        firstName: null,
        lastName: null,
        role: 'admin',
        userId: 'admin-1',
      }),
    ).toEqual({
      email: 'admin@example.com',
      firstName: null,
      lastName: null,
      role: 'admin',
      userId: 'admin-1',
    });
    expect(
      collectionOptions.schema.parse({
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role: 'user',
        userId: 'user-1',
      }),
    ).toEqual({
      email: 'user@example.com',
      firstName: null,
      lastName: null,
      role: 'user',
      userId: 'user-1',
    });
  });

  it.each([
    {
      label: 'service role',
      user: { email: 'service@example.com', role: 'service', userId: 'user-1' },
    },
    {
      label: 'null role',
      user: { email: 'user@example.com', role: null, userId: 'user-1' },
    },
    {
      label: 'unknown role',
      user: { email: 'user@example.com', role: 'editor', userId: 'user-1' },
    },
    {
      label: 'blank user id',
      user: { email: 'user@example.com', role: 'user', userId: '   ' },
    },
    {
      label: 'blank email',
      user: { email: '   ', role: 'user', userId: 'user-1' },
    },
  ])('rejects $label at the collection schema boundary', ({ user }) => {
    expect(() => collectionOptions.schema.parse(user)).toThrow();
  });
});
