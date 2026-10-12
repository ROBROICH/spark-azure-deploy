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
    argumentId: 'A1',
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    compositeKey: toCompositeKey({ id, nodeType: 'argument' }),
    context: null,
    contextEndIdx: null,
    contextStartIdx: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    endIdx: null,
    erwiderung: null,
    frontendParentIds: [],
    id,
    inVae: false,
    isDeleted: false,
    isValidArgument: true,
    nodeType: 'argument',
    projectId: 'project-1',
    startIdx: null,
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    subTopicId: null,
    text: 'Argument text',
    topicId: 'topic-1',
    updateType: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
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
      inVae: false,
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
      inVae: false,
    });

    recipe(draft);

    expect(draft.inVae).toBe(true);
  });

  it('does not mutate invalid arguments even when the card invokes the toggle', async () => {
    const user = userEvent.setup();

    render(
      <AiParticipationArgumentVirtualList
        argumentsList={[
          createArgument({
            id: 'argument-1',
            isValidArgument: false,
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
