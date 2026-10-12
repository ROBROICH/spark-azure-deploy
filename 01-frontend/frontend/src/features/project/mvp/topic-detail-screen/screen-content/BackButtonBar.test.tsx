import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackButtonBar } from './BackButtonBar';

const { useDescendantNodesMock, useNodeMock } = vi.hoisted(() => ({
  useDescendantNodesMock: vi.fn(),
  useNodeMock: vi.fn(),
}));
const { linkPropsMock } = vi.hoisted(() => ({
  linkPropsMock: vi.fn(),
}));

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: useDescendantNodesMock,
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: useNodeMock,
}));

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    children?: ReactNode;
    from?: string;
    resetScroll?: boolean;
    search?: (prev: Record<string, unknown>) => Record<string, unknown>;
    to?: string;
  }) => {
    linkPropsMock(props);

    return <a>{props.children}</a>;
  },
  getRouteApi: () => ({
    useParams: () => ({
      topicName: 'topic-1',
      verfahrenId: 'project-1',
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number>) => {
      if (key === 'BackButtonBar.progress') {
        return `${String(params?.done)} von ${String(params?.total)} Normen geprüft`;
      }

      return key;
    },
  }),
}));

vi.mock(
  '@/features/access-control/topic-permissions/TopicWritePermissionBadge',
  () => ({
    TopicWritePermissionBadge: (props: { assigneeIds: string[] }) => (
      <span data-testid="topic-write-permission-badge">
        {props.assigneeIds.join(',')}
      </span>
    ),
  }),
);

describe('BackButtonBar', () => {
  beforeEach(() => {
    useDescendantNodesMock.mockReset();
    useNodeMock.mockReset();
    linkPropsMock.mockReset();
    useDescendantNodesMock.mockReturnValue({ data: [] });
    useNodeMock.mockReturnValue({
      data: {
        id: 'topic-1',
        mvpAssignees: ['member-id'],
        name: 'Topic one',
      },
    });
  });

  afterEach(cleanup);

  it('strips detail-only route state when returning to the overview', () => {
    render(
      <BackButtonBar
        laneOrderPreference="documentsFirst"
        onLaneOrderChange={vi.fn()}
      />,
    );

    const linkProps = linkPropsMock.mock.calls[0]?.[0];
    expect(
      linkProps.search({
        detailDocumentId: 'topic-norm-1',
        feedbackRating: 'positive',
        feedbackTargetId: 'fundstelle-1',
        feedbackTargetType: 'fundstelle',
        laneOrder: 'rechtsgrundlageFirst',
        lawChangeId: 'law-change-1',
        leftPanelTab: 'rechtsgrundlage',
        previewDocumentId: 'doc-2',
        rechtsgrundlageLawGroupId: 'law-group-1',
        search: 'wasser',
        selectedDocumentId: 'doc-1',
        selectedNormId: 'norm-1',
        topicAssigneeIds: ['user-1'],
        topicSort: 'titleDesc',
        topicStatus: 'inProgress',
      }),
    ).toEqual({
      search: 'wasser',
      topicAssigneeIds: ['user-1'],
      topicSort: 'titleDesc',
      topicStatus: 'inProgress',
    });
  });
});
