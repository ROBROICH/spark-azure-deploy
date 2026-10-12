import type React from 'react';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TeamTopicAssignmentPicker } from './TeamTopicAssignmentPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/features/ui/action-menu/ActionMenu', () => ({
  ActionMenu: (props: { children: React.ReactNode }) => {
    const { children } = props;

    return <div>{children}</div>;
  },
  ActionMenuCheckboxItem: (props: {
    checked?: boolean;
    children: React.ReactNode;
    onCheckedChange?: (checked: boolean) => void;
  }) => {
    const { checked = false, children, onCheckedChange } = props;

    return (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        onClick={() => {
          onCheckedChange?.(!checked);
        }}
      >
        {children}
      </button>
    );
  },
  ActionMenuContent: (props: { children: React.ReactNode }) => {
    const { children } = props;

    return <div>{children}</div>;
  },
  ActionMenuTrigger: (props: { children: React.ReactNode }) => {
    const { children } = props;

    return <>{children}</>;
  },
}));

afterEach(() => {
  cleanup();
});

const createTopic = (id: string, name: string): NodePayloadByType<'topic'> =>
  ({
    id,
    compositeKey: toCompositeKey({ id, nodeType: 'topic' }),
    createdAt: '',
    description: null,
    frontendParentIds: [],
    isDeleted: false,
    isOutdated: false,
    nodeType: 'topic',
    parentTopicId: null,
    projectId: 'project-1',
    projectVersion: 0,
    name,
    mvpAssignee: null,
    mvpAssignees: [],
    rpbAssignee: null,
    rpbAssignees: [],
    showInBeschluss: true,
    showInEwm: true,
    showInMvp: true,
    updateType: null,
    updatedAt: '',
  }) satisfies NodePayloadByType<'topic'>;

describe('TeamTopicAssignmentPicker', () => {
  it('sorts assignable topic options alphabetically from A', () => {
    render(
      <TeamTopicAssignmentPicker
        labelId="topic-label"
        topics={[
          createTopic('topic-c', 'Zoning'),
          createTopic('topic-a', 'Alpha'),
          createTopic('topic-b', 'Beta'),
        ]}
        value={[]}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByRole('menuitemcheckbox')
        .map((option) => option.textContent),
    ).toEqual(['Alpha', 'Beta', 'Zoning']);
  });

  it('reports topic selection and badge removal through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TeamTopicAssignmentPicker
        labelId="topic-label"
        topics={[
          createTopic('topic-a', 'Alpha'),
          createTopic('topic-b', 'Beta'),
        ]}
        value={['topic-a']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('menuitemcheckbox', { name: /Beta/u }));
    expect(onChange).toHaveBeenCalledWith(['topic-a', 'topic-b']);

    await user.click(
      screen.getByRole('button', {
        name: 'Team.topicAssignment.removeTopic',
      }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
