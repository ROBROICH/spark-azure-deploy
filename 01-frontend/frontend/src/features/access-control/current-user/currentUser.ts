import { queryOptions } from '@tanstack/react-query';
import { getIdentityMeGet } from '@/api-clients/identity-management-module/sdk.gen';
import type {
  IdentityResponse,
  OidcRole,
  UserOidcRole,
} from '@/api-clients/identity-management-module/types.gen';
import { getLocalDevCurrentUserEnv } from '@/features/shared/config/startupEnv';

export const CURRENT_USER_QUERY_KEY = ['current-user'] as const;

// `CurrentUserIdentity.role` is required even though `IdentityResponse.role` is
// optional and may include `'service'`. `getCurrentUser` narrows the API value
// down to `UserOidcRole` at the boundary so the rest of the SPA can rely on
// a real human role being present.
export type CurrentUserIdentity = Omit<IdentityResponse, 'role'> & {
  role: UserOidcRole;
};

export class CurrentUserLoadError extends Error {
  constructor(message = 'Current user could not be loaded') {
    super(message);
    this.name = 'CurrentUserLoadError';
  }
}

// Exhaustiveness guard: the `satisfies` clause fails to type-check if
// `UserOidcRole` ever gains a new member, keeping the boundary narrowing
// below in sync with the generated type.
const USER_KEYCLOAK_ROLES = {
  admin: true,
  user: true,
} as const satisfies Record<UserOidcRole, true>;

const isUserKeycloakRole = (
  value: OidcRole | null | undefined,
): value is UserOidcRole =>
  value !== null && value !== undefined && value in USER_KEYCLOAK_ROLES;

export function getCurrentUserDisplayName(identity: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const displayName = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (displayName) {
    return displayName;
  }

  return identity.email;
}

function getLocalDevCurrentUser(): CurrentUserIdentity {
  const localDevCurrentUser = getLocalDevCurrentUserEnv();

  return {
    userId: localDevCurrentUser.userId,
    email: localDevCurrentUser.email,
    firstName: localDevCurrentUser.firstName,
    lastName: localDevCurrentUser.lastName,
    role: 'admin',
  };
}

function shouldUseLocalDevCurrentUser() {
  return (
    import.meta.env.DEV ||
    import.meta.env.VITE_DEV_API_MODE?.trim().toLowerCase() ===
      'port-forwarding'
  );
}

export async function getCurrentUser(): Promise<CurrentUserIdentity> {
  if (shouldUseLocalDevCurrentUser()) {
    return getLocalDevCurrentUser();
  }

  let data: IdentityResponse;

  try {
    ({ data } = await getIdentityMeGet({
      throwOnError: true,
    }));
  } catch {
    throw new CurrentUserLoadError();
  }

  if (!isUserKeycloakRole(data.role)) {
    throw new CurrentUserLoadError('Current user role is not allowed');
  }

  return {
    ...data,
    role: data.role,
  };
}

export const getCurrentUserQueryOptions = () =>
  queryOptions({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    meta: {
      area: 'access-control',
      operation: 'load-current-user',
    },
    staleTime: Infinity,
  });
