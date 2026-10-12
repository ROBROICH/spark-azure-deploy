import { describe, expect, it } from 'vitest';
import { isProjectOwnerOrMember } from './isProjectOwnerOrMember';

describe('isProjectOwnerOrMember', () => {
  it('allows project owners', () => {
    expect(
      isProjectOwnerOrMember({
        project: { owners: ['owner-id'], members: [] },
        role: 'user',
        userId: 'owner-id',
      }),
    ).toBe(true);
  });

  it('allows admins outside the project team', () => {
    expect(
      isProjectOwnerOrMember({
        project: { owners: ['owner-id'], members: ['member-id'] },
        role: 'admin',
        userId: 'admin-id',
      }),
    ).toBe(true);
  });

  it('allows project members', () => {
    expect(
      isProjectOwnerOrMember({
        project: { owners: [], members: ['member-id'] },
        role: 'user',
        userId: 'member-id',
      }),
    ).toBe(true);
  });

  it('denies users outside the project team', () => {
    expect(
      isProjectOwnerOrMember({
        project: { owners: ['owner-id'], members: ['member-id'] },
        role: 'user',
        userId: 'other-user-id',
      }),
    ).toBe(false);
  });

  it('denies users when project team arrays are missing', () => {
    expect(
      isProjectOwnerOrMember({
        project: { owners: [], members: [] },
        role: 'user',
        userId: 'user-id',
      }),
    ).toBe(false);
  });
});
