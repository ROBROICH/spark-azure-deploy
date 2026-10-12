import type { IdentityResponse } from '@/api-clients/backend';
import { getOrganizationUserDisplayName } from '@/features/access-control/organization-users/organizationUser.utils';
import type { AvatarBandUser } from '@/features/ui/avatar-band/AvatarBand';
import type { UserPickerOption } from '@/features/ui/user-picker/UserPicker';

export const toUserPickerOptions = (
  users: IdentityResponse[],
): UserPickerOption[] =>
  users.map((user) => {
    const label = getOrganizationUserDisplayName(user) ?? user.email;

    return {
      id: user.userId,
      label,
      description: label === user.email ? undefined : user.email,
    };
  });

export const toAvatarBandUser = (user: IdentityResponse): AvatarBandUser => ({
  id: user.userId,
  name: getOrganizationUserDisplayName(user) ?? user.email,
  email: user.email,
});

export const sortUserIdsByUserOrder = (
  userIds: string[],
  users: IdentityResponse[],
): string[] => {
  const userOrderById = new Map(
    users.map((user, index) => [user.userId, index]),
  );

  return [...userIds].sort(
    (left, right) =>
      (userOrderById.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (userOrderById.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
};
