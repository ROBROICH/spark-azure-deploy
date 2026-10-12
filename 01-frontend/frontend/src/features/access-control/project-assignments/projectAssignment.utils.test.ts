import { describe, expect, it } from 'vitest';
import {
  replaceProjectAssignmentRelation,
  toProjectAssignmentsRequest,
  uniqueUserIds,
} from './projectAssignment.utils';

describe('projectAssignment.utils', () => {
  it('normalizes unique user ids by trimming whitespace and dropping blanks', () => {
    expect(uniqueUserIds([' user-1 ', '', 'user-2', 'user-1', '   '])).toEqual([
      'user-1',
      'user-2',
    ]);
  });

  it('keeps owners and members mutually exclusive after id normalization', () => {
    expect(
      replaceProjectAssignmentRelation({
        assignments: {
          owners: ['owner-1', ' user-1 '],
          members: ['user-1', 'member-1'],
        },
        relation: 'owner',
        value: ['user-1', ' owner-2 ', ''],
      }),
    ).toEqual({
      owners: ['user-1', 'owner-2'],
      members: ['member-1'],
    });
  });

  it('keeps members and owners mutually exclusive after member replacement', () => {
    expect(
      replaceProjectAssignmentRelation({
        assignments: {
          owners: ['owner-1', ' user-1 '],
          members: ['member-1'],
        },
        relation: 'member',
        value: [' user-1 ', ' member-2 ', ''],
      }),
    ).toEqual({
      owners: ['owner-1'],
      members: ['user-1', 'member-2'],
    });
  });

  it('does not forward blank or padded user ids in assignment requests', () => {
    expect(
      toProjectAssignmentsRequest({
        owners: [' owner-1 ', '', 'owner-1'],
        members: ['member-1', '   ', ' member-2 '],
      }),
    ).toEqual({
      assignments: [
        { role: 'owner', userId: 'owner-1' },
        { role: 'member', userId: 'member-1' },
        { role: 'member', userId: 'member-2' },
      ],
    });
  });
});
