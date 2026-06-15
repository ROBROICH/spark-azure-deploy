import {
  excludeSystemUserIds,
  isSystemUserId,
  SYSTEM_USER_ID,
} from './systemUsers';
import { describe, expect, it } from 'vitest';

describe('systemUsers', () => {
  it('identifies the frontend-hidden system user', () => {
    expect(isSystemUserId(SYSTEM_USER_ID)).toBe(true);
    expect(isSystemUserId('regular-user')).toBe(false);
  });

  it('filters system users from assignment lists', () => {
    expect(
      excludeSystemUserIds(['owner-1', SYSTEM_USER_ID, 'owner-2']),
    ).toEqual(['owner-1', 'owner-2']);
  });
});
