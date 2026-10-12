import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import type { ReactNode } from 'react';
import { EwmsWorkspace } from './EwmsWorkspace';

const mocks = vi.hoisted(() => ({
  useEwmsWorkspace: vi.fn(),
}));

vi.mock('@/features/ui/tabs/Tabs', () => ({
  Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./EwmsToolbar', () => ({
  EwmsToolbar: (props: { isNachreichenLoading?: boolean }) => (
    <div data-testid="toolbar-loading">
      {String(props.isNachreichenLoading)}
    </div>
  ),
}));

vi.mock('./EwmsWorkspaceSkeleton', () => ({
  EwmsWorkspaceSkeleton: () => <div>workspace-skeleton</div>,
}));

vi.mock('./objections/ObjectionsContent', () => ({
  ObjectionsContent: () => <div>objections-content</div>,
}));

vi.mock('./topics/TopicsContent', () => ({
  TopicsContent: () => <div>topics-content</div>,
}));

vi.mock('../argument-detail/ArgumentDetailView', () => ({
  ArgumentDetailView: () => <div>argument-detail</div>,
}));

vi.mock('./useEwmsWorkspace', () => ({
  useEwmsWorkspace: mocks.useEwmsWorkspace,
}));

const createEntry = (classificationStatus: 'loading' | 'done') => ({
  compositeKey: 'beteiligungs_eingang:entry-1' as CompositeKey,
  id: 'entry-1',
  nodeType: 'beteiligungs_eingang' as const,
  frontendParentIds: [],
  createdAt: '2026-05-25T12:00:00.000Z',
  fileId: 'file-1',
  filename: 'E1234.pdf',
  beteiligungTyp: 'einwendung',
  markdownId: null,
  extractionStatus: 'done',
  classificationStatus: classificationStatus,
});

const useWorkspaceState = (params: {
  classificationStatus: 'loading' | 'done';
}) => {
  const entry = createEntry(params.classificationStatus);

  mocks.useEwmsWorkspace.mockReturnValue({
    allArguments: [],
    checkedCount: 0,
    entriesById: new Map([[entry.id, entry]]),
    ewmsWorkspaceDataLoading: false,
    ewmsDocumentsLoadingMore: false,
    expandedTopicGroupId: undefined,
    handleArgumentBack: vi.fn(),
    handleDeleteArgument: vi.fn(),
    handleExpandTopicGroup: vi.fn(),
    handleExportResponses: vi.fn(),
    handleFilterChange: vi.fn(),
    handleOpenImportDialog: vi.fn(),
    handleOpenResponseImportDialog: vi.fn(),
    handleReviewArgumentClassification: vi.fn(),
    handleSearchChange: vi.fn(),
    handleSelectArgument: vi.fn(),
    handleSelectObjection: vi.fn(),
    handleSelectSubtopic: vi.fn(),
    handleSelectTopic: vi.fn(),
    handleSetArgumentsApproval: vi.fn(),
    handleSortChange: vi.fn(),
    handleTabChange: vi.fn(),
    handleToggleArgument: vi.fn(),
    handleUpdateArgumentSubtopic: vi.fn(),
    handleUpdateArgumentTopic: vi.fn(),
    isExportingResponses: false,
    objectionItems: [{ entry }],
    objectionsFilter: undefined,
    objectionsSearch: undefined,
    objectionsSort: 'nameAsc',
    selectedArgumentRef: null,
    selectedObjectionArguments: [],
    selectedObjectionArgumentsLoading: false,
    selectedObjectionId: entry.id,
    selectedSubtopicId: undefined,
    selectedTopicArguments: [],
    selectedTopicId: undefined,
    tab: 'sender',
    topics: [],
  });
};

afterEach(() => {
  cleanup();
  mocks.useEwmsWorkspace.mockReset();
});

describe('EwmsWorkspace import button loading state', () => {
  it('keeps the import button loading while objection nodes are still classifying', () => {
    useWorkspaceState({
      classificationStatus: 'loading',
    });

    render(<EwmsWorkspace isEwmsFileImportWorkflowRunning={false} />);

    expect(screen.getByTestId('toolbar-loading').textContent).toBe('true');
  });

  it('clears the import button loading once workflow and node state are settled', () => {
    useWorkspaceState({
      classificationStatus: 'done',
    });

    render(<EwmsWorkspace isEwmsFileImportWorkflowRunning={false} />);

    expect(screen.getByTestId('toolbar-loading').textContent).toBe('false');
  });
});
