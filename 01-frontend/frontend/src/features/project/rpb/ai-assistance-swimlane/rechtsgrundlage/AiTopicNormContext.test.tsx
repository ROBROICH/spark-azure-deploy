import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NodePayloadByType } from '@/db/nodes/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTopicNormProvider, useKiTopicNormState } from './AiTopicNormContext';

const mocks = vi.hoisted(() => ({
  hasTopicMutationRightsMock: vi.fn(),
  transactMock: vi.fn((callback: () => void) => {
    callback();
  }),
  updateMock: vi.fn(),
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRightsMock,
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => [
    { id: 'satz-1', nodeType: 'satz' },
    { id: 'satz-2', nodeType: 'satz' },
  ],
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: () => ({
    data: {
      satzStatuses: {},
      id: 'topic-norm-1',
      nodeType: 'topic_norm',
      topicId: 'topic-1',
    },
  }),
}));

const ContextProbe = () => {
  const { toggleAllSaetzeChecked, toggleSatzChecked } = useKiTopicNormState();

  return (
    <>
      <button type="button" onClick={() => toggleSatzChecked('satz-1')}>
        toggle-satz
      </button>
      <button type="button" onClick={() => toggleSatzChecked('satz-3')}>
        toggle-unrelated-satz
      </button>
      <button type="button" onClick={toggleAllSaetzeChecked}>
        toggle-all
      </button>
    </>
  );
};

describe('AiTopicNormContext', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.hasTopicMutationRightsMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.transactMock.mockClear();
    mocks.updateMock.mockReset();
  });

  it('guards single sentence completion mutations with topic rights', async () => {
    const user = userEvent.setup();
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <AiTopicNormProvider
        topicNormRef={{ id: 'topic-norm-1', nodeType: 'topic_norm' }}
      >
        <ContextProbe />
      </AiTopicNormProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'toggle-satz' }));

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-1');
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('guards bulk sentence completion mutations with topic rights', async () => {
    const user = userEvent.setup();
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <AiTopicNormProvider
        topicNormRef={{ id: 'topic-norm-1', nodeType: 'topic_norm' }}
      >
        <ContextProbe />
      </AiTopicNormProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'toggle-all' }));

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-1');
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('executes the single sentence completion mutation recipe', async () => {
    const user = userEvent.setup();

    render(
      <AiTopicNormProvider
        topicNormRef={{ id: 'topic-norm-1', nodeType: 'topic_norm' }}
      >
        <ContextProbe />
      </AiTopicNormProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'toggle-satz' }));

    expect(mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'topic-norm-1' }),
      expect.any(Function),
    );

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: Pick<NodePayloadByType<'topic_norm'>, 'satzStatuses'>,
    ) => void;
    const draft = {
      satzStatuses: {},
    } satisfies Pick<NodePayloadByType<'topic_norm'>, 'satzStatuses'>;

    recipe(draft);

    expect(draft.satzStatuses).toEqual({
      'satz-1': 'checked',
    });
  });

  it('guards single sentence completion mutations to descendant Satz ids', async () => {
    const user = userEvent.setup();

    render(
      <AiTopicNormProvider
        topicNormRef={{ id: 'topic-norm-1', nodeType: 'topic_norm' }}
      >
        <ContextProbe />
      </AiTopicNormProvider>,
    );

    await user.click(
      screen.getByRole('button', { name: 'toggle-unrelated-satz' }),
    );

    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('executes the bulk sentence completion mutation recipe', async () => {
    const user = userEvent.setup();

    render(
      <AiTopicNormProvider
        topicNormRef={{ id: 'topic-norm-1', nodeType: 'topic_norm' }}
      >
        <ContextProbe />
      </AiTopicNormProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'toggle-all' }));

    expect(mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'topic-norm-1' }),
      expect.any(Function),
    );

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: Pick<NodePayloadByType<'topic_norm'>, 'satzStatuses'>,
    ) => void;
    const draft = {
      satzStatuses: {
        'satz-1': 'needs_revision',
      },
    } satisfies Pick<NodePayloadByType<'topic_norm'>, 'satzStatuses'>;

    recipe(draft);

    expect(draft.satzStatuses).toEqual({
      'satz-1': 'checked',
      'satz-2': 'checked',
    });
  });
});
