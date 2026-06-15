import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FvpTopicAssignmentProvider,
  useFvpTopicAssignment,
} from './FvpTopicAssignmentContext';

const {
  hasTopicMutationRightsMock,
  transactMock,
  updateMock,
  useGraphMock,
  useLiveNodesMock,
  useLiveTopicNodesMock,
} = vi.hoisted(() => ({
  hasTopicMutationRightsMock: vi.fn<(topicId: string | null) => boolean>(),
  transactMock: vi.fn((callback: () => void) => {
    callback();

    return {
      isPersisted: {
        promise: Promise.resolve(),
      },
    };
  }),
  updateMock: vi.fn(),
  useGraphMock: vi.fn(),
  useLiveNodesMock: vi.fn(),
  useLiveTopicNodesMock: vi.fn(),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: useGraphMock,
}));

vi.mock('@/db/nodes/hooks/useTopicNodes', () => ({
  useLiveTopicNodes: useLiveTopicNodesMock,
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: useLiveNodesMock,
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useLiveHasTopicMutationRights: () => hasTopicMutationRightsMock,
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: transactMock,
    update: updateMock,
  }),
}));

afterEach(cleanup);

const Consumer = (props: { dmsFileId: string }) => {
  const {
    commitTopicIds,
    hasLinkedDocument,
    isLoading,
    selectedTopicIds,
    topicOptions,
  } = useFvpTopicAssignment(props.dmsFileId);

  return (
    <div>
      <span data-testid="is-loading">{isLoading ? 'loading' : 'ready'}</span>
      <span data-testid="selected-topic">
        {selectedTopicIds.length > 0 ? selectedTopicIds.join(',') : 'none'}
      </span>
      <span data-testid="topic-option-count">{topicOptions.length}</span>
      <button
        type="button"
        disabled={!hasLinkedDocument}
        onClick={() => commitTopicIds(props.dmsFileId, ['T-Artenschutz'])}
      >
        Commit topics
      </button>
    </div>
  );
};

describe('FvpTopicAssignmentProvider', () => {
  beforeEach(() => {
    hasTopicMutationRightsMock.mockReset();
    hasTopicMutationRightsMock.mockReturnValue(true);
    transactMock.mockClear();
    updateMock.mockReset();
    useGraphMock.mockReset();
    useLiveNodesMock.mockReset();
    useLiveTopicNodesMock.mockReset();

    useGraphMock.mockReturnValue({
      getDescendants: vi.fn((nodeId: string) =>
        nodeId === 'file-1'
          ? [
              { id: 'linked-1', node_type: 'dokument' },
              { id: 'topic-1', node_type: 'topic' },
            ]
          : [{ id: 'linked-2', node_type: 'dokument' }],
      ),
      isLoadingRequiredGraphData: false,
    });
    useLiveTopicNodesMock.mockReturnValue({
      data: [
        { id: 'T-Energiewirtschaft', name: 'Energiewirtschaft' },
        { id: 'T-Artenschutz', name: 'Artenschutz' },
      ],
      isLoading: false,
    });
    useLiveNodesMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('builds topic assignments only for visible document rows', () => {
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-1',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-1',
          dms_file_id: 'file-1',
          frontend_parent_ids: [
            'norm:norm-1',
            'topic:T-Energiewirtschaft',
            'topic:T-Artenschutz',
          ],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    expect(useLiveNodesMock).toHaveBeenCalledWith([
      { id: 'linked-1', node_type: 'dokument' },
    ]);
    expect(screen.getByTestId('selected-topic').textContent).toBe(
      'T-Energiewirtschaft,T-Artenschutz',
    );
    expect(screen.getByTestId('topic-option-count').textContent).toBe('2');
  });

  it('writes committed topics back to the linked dokument payload', () => {
    const linkedDocument = {
      id: 'linked-1',
      node_type: 'dokument',
      compositeKey: 'dokument:linked-1',
      dms_file_id: 'file-1',
      frontend_parent_ids: ['norm:norm-1', 'topic:T-Bestand'],
    };
    const updatedDrafts: {
      frontend_parent_ids: string[];
    }[] = [];

    useLiveNodesMock.mockReturnValue({
      data: [linkedDocument],
      isLoading: false,
    });
    updateMock.mockImplementation(
      (
        node: typeof linkedDocument,
        updater: (draft: typeof linkedDocument) => void,
      ) => {
        const draft = { ...node };
        updater(draft);
        updatedDrafts.push({
          frontend_parent_ids: draft.frontend_parent_ids,
        });
      },
    );

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commit topics' }));

    expect(transactMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      linkedDocument,
      expect.any(Function),
    );
    expect(updatedDrafts).toEqual([
      {
        frontend_parent_ids: ['norm:norm-1', 'topic:T-Artenschutz'],
      },
    ]);
  });

  it('fails closed when the user lacks mutation rights for an affected topic', () => {
    hasTopicMutationRightsMock.mockImplementation(
      (topicId) => topicId !== 'T-Artenschutz',
    );
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-1',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-1',
          dms_file_id: 'file-1',
          frontend_parent_ids: ['norm:norm-1', 'topic:T-Bestand'],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commit topics' }));

    expect(transactMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('carries topic loading through the assignment hook and prevents commits', () => {
    useLiveTopicNodesMock.mockReturnValue({
      data: [{ id: 'T-Artenschutz', name: 'Artenschutz' }],
      isLoading: true,
    });
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-1',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-1',
          dms_file_id: 'file-1',
          frontend_parent_ids: ['norm:norm-1', 'topic:T-Bestand'],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    expect(screen.getByTestId('is-loading').textContent).toBe('loading');
    expect(screen.getByTestId('topic-option-count').textContent).toBe('0');
    expect(
      screen
        .getByRole('button', { name: 'Commit topics' })
        .hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Commit topics' }));

    expect(transactMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('prevents commits while linked dokument payloads are loading', () => {
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-1',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-1',
          dms_file_id: 'file-1',
          frontend_parent_ids: ['norm:norm-1', 'topic:T-Bestand'],
        },
      ],
      isLoading: true,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    expect(screen.getByTestId('is-loading').textContent).toBe('loading');
    expect(screen.getByTestId('selected-topic').textContent).toBe('none');
    expect(
      screen
        .getByRole('button', { name: 'Commit topics' })
        .hasAttribute('disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Commit topics' }));

    expect(transactMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not link deleted or outdated dokument payloads', () => {
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-outdated',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-outdated',
          dms_file_id: 'file-1',
          is_deleted: false,
          is_outdated: true,
          frontend_parent_ids: ['topic:T-Energiewirtschaft'],
        },
        {
          id: 'linked-deleted',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-deleted',
          dms_file_id: 'file-1',
          is_deleted: true,
          is_outdated: false,
          frontend_parent_ids: ['topic:T-Artenschutz'],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    expect(screen.getByTestId('selected-topic').textContent).toBe('none');
    expect(
      screen
        .getByRole('button', { name: 'Commit topics' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('links the active dokument payload when a stale payload shares the file id', () => {
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-outdated',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-outdated',
          dms_file_id: 'file-1',
          is_deleted: false,
          is_outdated: true,
          frontend_parent_ids: ['topic:T-Energiewirtschaft'],
        },
        {
          id: 'linked-active',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-active',
          dms_file_id: 'file-1',
          is_deleted: false,
          is_outdated: false,
          frontend_parent_ids: ['topic:T-Artenschutz'],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    expect(screen.getByTestId('selected-topic').textContent).toBe(
      'T-Artenschutz',
    );
  });

  it('handles persistence failures without leaving an unhandled rejection', async () => {
    transactMock.mockImplementationOnce((callback: () => void) => {
      callback();

      return {
        isPersisted: {
          promise: Promise.reject(new Error('persist failed')),
        },
      };
    });
    useLiveNodesMock.mockReturnValue({
      data: [
        {
          id: 'linked-1',
          node_type: 'dokument',
          compositeKey: 'dokument:linked-1',
          dms_file_id: 'file-1',
          frontend_parent_ids: ['norm:norm-1'],
        },
      ],
      isLoading: false,
    });

    render(
      <FvpTopicAssignmentProvider
        rows={[
          {
            kind: 'document',
            id: 'file-1',
            filename: 'Visible.pdf',
            status: 'Zugeordnet',
          },
        ]}
      >
        <Consumer dmsFileId="file-1" />
      </FvpTopicAssignmentProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commit topics' }));

    await Promise.resolve();
    await Promise.resolve();

    expect(transactMock).toHaveBeenCalledTimes(1);
  });
});
