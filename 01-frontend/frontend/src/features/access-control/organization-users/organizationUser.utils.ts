import type { IdentityResponse } from '@/api-clients/identity-management-module';

export const getOrganizationUserDisplayName = (
  user: IdentityResponse | undefined,
) => {
  if (!user) {
    return null;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

  if (fullName) {
    return fullName;
  }

  return user.email;
};

const getOrganizationUserSortName = (user: IdentityResponse) =>
  getOrganizationUserDisplayName(user) ?? user.email;

const organizationUserNameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
});

export const sortOrganizationUsersByName = (
  users: IdentityResponse[],
): IdentityResponse[] =>
  [...users].sort((left, right) =>
    organizationUserNameCollator.compare(
      getOrganizationUserSortName(left),
      getOrganizationUserSortName(right),
    ),
  );
