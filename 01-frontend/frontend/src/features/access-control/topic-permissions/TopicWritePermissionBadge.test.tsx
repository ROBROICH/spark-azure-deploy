import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import deProject from '@/features/project/de-project.json';
import enProject from '@/features/project/en-project.json';
import type { TopicWritePermissionReason } from './hasTopicMutationRights';
import { TopicWritePermissionBadge } from './TopicWritePermissionBadge';

const { useCurrentUserMock, useProjectMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
  useProjectMock: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: useCurrentUserMock,
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProject: useProjectMock,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({
      verfahrenId: 'project-1',
    }),
  }),
}));

const translations: Record<string, string> = {
  'TopicWritePermissionBadge.editable': 'Bearbeitbar',
  'TopicWritePermissionBadge.notEditable': 'Nicht bearbeitbar',
  'TopicWritePermissionBadge.tooltip.admin':
    'Sie können dieses Thema bearbeiten, weil Sie Administrator sind.',
  'TopicWritePermissionBadge.tooltip.assigned':
    'Sie können dieses Thema bearbeiten, weil es Ihnen zugewiesen ist.',
  'TopicWritePermissionBadge.tooltip.assignedToOtherUser':
    'Sie können dieses Thema nicht bearbeiten, weil es einer anderen Person zugewiesen ist.',
  'TopicWritePermissionBadge.tooltip.noTopic':
    'Dieses Kapitel hat kein verknüpftes Thema.',
  'TopicWritePermissionBadge.tooltip.notMember':
    'Sie können dieses Thema nicht bearbeiten, weil Sie nicht zum Verfahrensteam gehören.',
  'TopicWritePermissionBadge.tooltip.owner':
    'Sie können dieses Thema bearbeiten, weil Sie Verfahrensleitung sind.',
  'TopicWritePermissionBadge.tooltip.unassignedTopic':
    'Sie können dieses Thema bearbeiten, weil es niemandem zugewiesen ist.',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

const topicWritePermissionReasons = [
  'admin',
  'assigned',
  'assignedToOtherUser',
  'noTopic',
  'notMember',
  'owner',
  'unassignedTopic',
] satisfies TopicWritePermissionReason[];

describe('TopicWritePermissionBadge', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
    useProjectMock.mockReset();
    useCurrentUserMock.mockReturnValue({
      role: 'user',
      userId: 'member-id',
    });
    useProjectMock.mockReturnValue({
      data: {
        members: ['member-id'],
        owners: [],
      },
    });
  });

  afterEach(cleanup);

  it('renders the large editable label and assignment reason', () => {
    render(
      <TopicWritePermissionBadge assigneeIds={['member-id']} variant="large" />,
    );

    expect(screen.getByText('Bearbeitbar')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /Sie können dieses Thema bearbeiten, weil es Ihnen zugewiesen ist/u,
      }),
    ).toBeVisible();
  });

  it('renders the small locked icon without visible label', async () => {
    render(
      <TopicWritePermissionBadge
        assigneeIds={['other-member-id']}
        variant="small"
      />,
    );

    expect(screen.queryByText('Nicht bearbeitbar')).not.toBeInTheDocument();
    const badge = screen.getByRole('button', {
      name: /einer anderen Person zugewiesen/u,
    });

    expect(badge).toBeVisible();

    await userEvent.click(badge);

    const tooltipTexts = await screen.findAllByText(
      'Sie können dieses Thema nicht bearbeiten, weil es einer anderen Person zugewiesen ist.',
    );

    expect(tooltipTexts[0]).toBeVisible();
  });

  it('explains no-topic chapters with the no-topic reason', () => {
    render(<TopicWritePermissionBadge assigneeIds={null} variant="large" />);

    expect(
      screen.getByRole('button', {
        name: /Dieses Kapitel hat kein verknüpftes Thema/u,
      }),
    ).toBeVisible();
  });

  it('renders from a precomputed permission without subscribing to the project', () => {
    render(
      <TopicWritePermissionBadge
        permission={{ canWrite: false, reason: 'assignedToOtherUser' }}
        variant="large"
      />,
    );

    expect(useProjectMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', {
        name: /einer anderen Person zugewiesen/u,
      }),
    ).toBeVisible();
  });

  it.each(topicWritePermissionReasons)(
    'renders copy for the %s permission reason',
    (reason) => {
      render(
        <TopicWritePermissionBadge
          permission={{
            canWrite: !['assignedToOtherUser', 'notMember'].includes(reason),
            reason,
          }}
          variant="large"
        />,
      );

      expect(
        screen.getByRole('button', {
          name: new RegExp(
            translations[`TopicWritePermissionBadge.tooltip.${reason}`] ?? '',
            'u',
          ),
        }),
      ).toBeVisible();
    },
  );

  it('keeps Project locale tooltip keys aligned with permission reasons', () => {
    expect(
      Object.keys(deProject.TopicWritePermissionBadge.tooltip).sort(),
    ).toEqual([...topicWritePermissionReasons].sort());
    expect(
      Object.keys(enProject.TopicWritePermissionBadge.tooltip).sort(),
    ).toEqual([...topicWritePermissionReasons].sort());
  });
});
