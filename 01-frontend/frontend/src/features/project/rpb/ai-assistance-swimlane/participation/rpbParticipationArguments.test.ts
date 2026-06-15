import { describe, expect, it } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { RpbArgumentNode } from './rpbParticipationArguments';
import {
  buildRpbParticipationSubtopicItemFromArguments,
  sortRpbArguments,
} from './rpbParticipationArguments';

const argument = (
  overrides: Partial<RpbArgumentNode> & Pick<RpbArgumentNode, 'id'>,
): RpbArgumentNode =>
  ({
    argument_id: null,
    beteiligungs_eingang_id: 'entry-1',
    compositeKey: toCompositeKey({
      id: overrides.id,
      node_type: 'argument',
    }),
    context: null,
    context_end_idx: null,
    context_start_idx: null,
    created_at: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    end_idx: null,
    erwiderung: null,
    frontend_parent_ids: [],
    in_vae: false,
    is_valid_argument: true,
    is_deleted: false,
    node_type: 'argument',
    project_id: 'project-1',
    start_idx: null,
    status: 'open',
    sub_topic_id: null,
    sys_period: null,
    text: null,
    topic_id: 'topic-1',
    update_type: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) satisfies RpbArgumentNode;

describe('rpbParticipationArguments', () => {
  it('counts invalid arguments in totals but not in valid progress', () => {
    const item = buildRpbParticipationSubtopicItemFromArguments(
      'subtopic-1',
      'Artenschutz',
      [
        argument({
          id: 'argument-1',
          in_vae: true,
          is_valid_argument: true,
          sub_topic_id: 'subtopic-1',
        }),
        argument({
          id: 'argument-2',
          in_vae: true,
          is_valid_argument: false,
          sub_topic_id: 'subtopic-1',
        }),
      ],
    );

    expect(item).toMatchObject({
      totalCount: 2,
      validCount: 1,
      inBeschlussCount: 1,
    });
  });

  it('sorts valid arguments before invalid arguments by reference', () => {
    const sorted = sortRpbArguments([
      argument({
        id: 'argument-3',
        argument_id: 'A1',
        is_valid_argument: false,
      }),
      argument({
        id: 'argument-2',
        argument_id: 'A10',
        is_valid_argument: true,
      }),
      argument({
        id: 'argument-1',
        argument_id: 'A2',
        is_valid_argument: true,
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      'argument-1',
      'argument-2',
      'argument-3',
    ]);
  });
});
