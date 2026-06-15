export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

export const isSystemUserId = (userId: string) => userId === SYSTEM_USER_ID;

export const excludeSystemUserIds = (userIds: string[]) =>
  userIds.filter((userId) => !isSystemUserId(userId));
