import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiParticipationArgumentVirtualList } from './AiParticipationArgumentVirtualList';
import type { RpbArgumentNode } from './rpbParticipationArguments';

const mocks = vi.hoisted(() => ({
  transactMock: vi.fn((callback: () => void) => callback()),
  updateMock: vi.fn(),
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 160,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: `item-${index}`,
        start: index * 160,
      })),
    measureElement: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./AiParticipationArgumentCard', () => ({
  AiParticipationArgumentCard: (props: {
    argument: RpbArgumentNode;
    canMutate: boolean;
    onToggleInBeschluss: (argument: RpbArgumentNode) => void;
  }) => (
    <button
      type="button"
      disabled={!props.canMutate}
      onClick={() => props.onToggleInBeschluss(props.argument)}
    >
      toggle {props.argument.id}
    </button>
  ),
}));

const createArgument = (
  overrides: Partial<RpbArgumentNode> = {},
): RpbArgumentNode => {
  const id = overrides.id ?? 'argument-1';

  return {
    argument_id: 'A1',
    beteiligungs_eingang_id: 'entry-1',
    compositeKey: toCompositeKey({ id, node_type: 'argument' }),
    context: null,
    context_end_idx: null,
    context_start_idx: null,
    created_at: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    end_idx: null,
    erwiderung: null,
    frontend_parent_ids: [],
    id,
    in_vae: false,
    is_deleted: false,
    is_valid_argument: true,
    node_type: 'argument',
    project_id: 'project-1',
    start_idx: null,
    status: 'open',
    sub_topic_id: null,
    sys_period: null,
    text: 'Argument text',
    topic_id: 'topic-1',
    update_type: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } satisfies RpbArgumentNode;
};

describe('AiParticipationArgumentVirtualList', () => {
  beforeEach(() => {
    mocks.transactMock.mockClear();
    mocks.updateMock.mockReset();
  });

  afterEach(cleanup);

  it('executes the mutation recipe that toggles in_vae on a valid argument', async () => {
    const user = userEvent.setup();
    const argument = createArgument({
      id: 'argument-1',
      in_vae: false,
    });

    render(
      <AiParticipationArgumentVirtualList
        argumentsList={[argument]}
        canMutate
      />,
    );

    await user.click(screen.getByRole('button', { name: 'toggle argument-1' }));

    expect(mocks.transactMock).toHaveBeenCalledOnce();
    expect(mocks.updateMock).toHaveBeenCalledWith(
      argument,
      expect.any(Function),
    );

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: RpbArgumentNode,
    ) => void;
    const draft = createArgument({
      id: 'argument-1',
      in_vae: false,
    });

    recipe(draft);

    expect(draft.in_vae).toBe(true);
  });

  it('does not mutate invalid arguments even when the card invokes the toggle', async () => {
    const user = userEvent.setup();

    render(
      <AiParticipationArgumentVirtualList
        argumentsList={[
          createArgument({
            id: 'argument-1',
            is_valid_argument: false,
          }),
        ]}
        canMutate
      />,
    );

    await user.click(screen.getByRole('button', { name: 'toggle argument-1' }));

    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });
});
