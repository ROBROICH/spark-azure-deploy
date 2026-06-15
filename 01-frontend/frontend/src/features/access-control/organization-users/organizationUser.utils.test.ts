import { describe, expect, it } from 'vitest';
import { sortOrganizationUsersByName } from './organizationUser.utils';

describe('sortOrganizationUsersByName', () => {
  it('sorts by display name without mutating the source list', () => {
    const users = [
      {
        userId: '2',
        email: 'zoe@example.com',
        firstName: 'Zoe',
        lastName: 'Example',
      },
      {
        userId: '1',
        email: 'anna@example.com',
        firstName: 'Anna',
        lastName: 'Example',
      },
    ];

    expect(
      sortOrganizationUsersByName(users).map((user) => user.userId),
    ).toEqual(['1', '2']);
    expect(users.map((user) => user.userId)).toEqual(['2', '1']);
  });

  it('sorts case and accents with base collation while preserving email fallback', () => {
    const users = [
      {
        userId: '3',
        email: 'zoe@example.com',
        firstName: 'zoe',
        lastName: 'Example',
      },
      {
        userId: '2',
        email: 'fallback@example.com',
      },
      {
        userId: '1',
        email: 'alvaro@example.com',
        firstName: 'Álvaro',
        lastName: 'Example',
      },
    ];

    expect(
      sortOrganizationUsersByName(users).map((user) => user.userId),
    ).toEqual(['1', '2', '3']);
  });
});
