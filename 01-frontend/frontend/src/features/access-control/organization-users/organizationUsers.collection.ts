import { v1IdentityListIdentities as listIdentities } from '@/api-clients/backend';
import type { IdentityResponse } from '@/api-clients/backend/types.gen';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection, useLiveQuery } from '@tanstack/react-db';
import { z } from 'zod';
import { isSystemUserId } from '@/features/access-control/system-users/systemUsers';

const nonEmptyString = z
  .string()
  .refine((value) => value.trim().length > 0, 'Required');

const organizationUserSchema = z.object({
  userId: nonEmptyString,
  email: nonEmptyString,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: z.enum(['admin', 'user']),
});

type OrganizationUser = z.infer<typeof organizationUserSchema>;
type AssignableOrganizationUser = IdentityResponse & OrganizationUser;

const isHumanKeycloakRole = (
  role: IdentityResponse['role'],
): role is 'admin' | 'user' => role === 'admin' || role === 'user';

export const isAssignableOrganizationUser = (
  user: IdentityResponse,
): user is AssignableOrganizationUser =>
  !isSystemUserId(user.userId) && isHumanKeycloakRole(user.role);

export const organizationUsersCollection = createCollection(
  queryCollectionOptions({
    id: 'organization-users',
    queryKey: ['organization-users'],
    queryFn: async () => {
      const { data } = await listIdentities({
        throwOnError: true,
      });

      return data.users.filter(isAssignableOrganizationUser);
    },
    schema: organizationUserSchema,
    queryClient,
    getKey: (item) => item.userId,
  }),
);

export const useOrganizationUsers = () =>
  useLiveQuery((q) =>
    q.from({ organizationUsers: organizationUsersCollection }),
  );
