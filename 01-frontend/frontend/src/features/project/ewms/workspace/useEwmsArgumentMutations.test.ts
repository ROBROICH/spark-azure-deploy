import type { CompositeKey } from '@/db/nodes/compositeKey';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EwmsArgumentNode } from '../data/ewms.nodes';
import { useEwmsArgumentMutations } from './useEwmsArgumentMutations';

const mocks = vi.hoisted(() => ({
  canMutateProject: true,
  deleteNode: vi.fn(),
  hasTopicMutationRights: vi.fn(() => true),
  trackPersistenceForNodeSummaryRefetch: vi.fn(),
  transact: vi.fn(),
  update: vi.fn(),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRights,
  }),
);

vi.mock('./EwmsSubtopicsContext', () => ({
  useEwmsSubtopics: () => ({
    getSubtopicItemsForTopic: () => [],
    trackPersistenceForNodeSummaryRefetch:
      mocks.trackPersistenceForNodeSummaryRefetch,
  }),
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    delete: mocks.deleteNode,
    transact: mocks.transact,
    update: mocks.update,
  }),
}));

const makeArgument = () =>
  ({
    compositeKey: 'argument:argument-1' as CompositeKey,
    id: 'argument-1',
    nodeType: 'argument',
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    subTopicId: null,
    topicId: 'topic-1',
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    text: 'Argument text',
    startIdx: null,
    endIdx: null,
    erwiderung: null,
    einordnung: null,
    context: null,
    contextStartIdx: null,
    contextEndIdx: null,
    argumentId: 'EXAMPLE-ARG-1',
    inVae: false,
    isValidArgument: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsArgumentNode;

afterEach(() => {
  mocks.canMutateProject = true;
  mocks.deleteNode.mockReset();
  mocks.hasTopicMutationRights.mockReset();
  mocks.hasTopicMutationRights.mockReturnValue(true);
  mocks.trackPersistenceForNodeSummaryRefetch.mockReset();
  mocks.transact.mockReset();
  mocks.update.mockReset();
});

const renderUseEwmsArgumentMutations = () =>
  renderHook(() => useEwmsArgumentMutations());

describe('useEwmsArgumentMutations permissions', () => {
  it('does not call transact for mutating handlers when project mutation is denied', () => {
    mocks.canMutateProject = false;
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleToggleArgument(argument);
    result.current.handleSetArgumentsApproval([argument], true);
    result.current.handleUpdateArgumentTopic(argument, 'topic-2');
    result.current.handleUpdateArgumentSubtopic(argument, 'subtopic-2');
    result.current.handleReviewArgumentClassification(argument, true);
    result.current.handleDeleteArgument(argument);

    expect(mocks.transact).not.toHaveBeenCalled();
    expect(mocks.deleteNode).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.trackPersistenceForNodeSummaryRefetch).not.toHaveBeenCalled();
  });

  it('does not call transact for topic-linked arguments when topic mutation is denied', () => {
    mocks.hasTopicMutationRights.mockReturnValue(false);
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleToggleArgument(argument);
    result.current.handleSetArgumentsApproval([argument], true);
    result.current.handleUpdateArgumentTopic(argument, 'topic-2');
    result.current.handleUpdateArgumentSubtopic(argument, 'subtopic-2');
    result.current.handleReviewArgumentClassification(argument, true);
    result.current.handleDeleteArgument(argument);

    expect(mocks.transact).not.toHaveBeenCalled();
    expect(mocks.deleteNode).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.trackPersistenceForNodeSummaryRefetch).not.toHaveBeenCalled();
  });
});

describe('useEwmsArgumentMutations node summary refetch tracking', () => {
  const createPersistedTransaction = () => ({
    isPersisted: {
      promise: Promise.resolve(),
    },
  });

  it('tracks persisted topic classification changes', () => {
    const tx = createPersistedTransaction();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleUpdateArgumentTopic(argument, 'topic-2');

    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('tracks persisted subtopic classification changes', () => {
    const tx = createPersistedTransaction();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleUpdateArgumentSubtopic(argument, 'subtopic-2');

    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('tracks persisted rejected classification changes', () => {
    const tx = createPersistedTransaction();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleReviewArgumentClassification(argument, false);

    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('does not track accepted classification reviews', () => {
    const tx = createPersistedTransaction();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleReviewArgumentClassification(argument, true);

    expect(mocks.trackPersistenceForNodeSummaryRefetch).not.toHaveBeenCalled();
  });

  it('does not track approval toggles', () => {
    const tx = createPersistedTransaction();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    const argument = makeArgument();
    const { result } = renderUseEwmsArgumentMutations();

    result.current.handleToggleArgument(argument);

    expect(mocks.trackPersistenceForNodeSummaryRefetch).not.toHaveBeenCalled();
  });
});
