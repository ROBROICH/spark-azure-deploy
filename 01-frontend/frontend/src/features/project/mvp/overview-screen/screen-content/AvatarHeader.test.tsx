import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarHeader } from './AvatarHeader';

const { projectUsersState, userPickerPropsMock } = vi.hoisted(() => ({
  projectUsersState: {
    hasProjectUser: (userId: string) =>
      ['user-1', 'user-2', 'user-3'].includes(userId),
    isOrganizationUsersError: false,
    projectUsers: [
      { userId: 'user-2', email: 'two@example.test', fullName: 'Two User' },
      { userId: 'user-1', email: 'one@example.test', fullName: 'One User' },
      { userId: 'user-3', email: 'three@example.test', fullName: 'Three User' },
      { userId: 'user-4', email: 'four@example.test', fullName: 'Four User' },
      { userId: 'user-5', email: 'five@example.test', fullName: 'Five User' },
      { userId: 'user-6', email: 'six@example.test', fullName: 'Six User' },
      { userId: 'user-7', email: 'seven@example.test', fullName: 'Seven User' },
      { userId: 'user-8', email: 'eight@example.test', fullName: 'Eight User' },
    ],
  },
  userPickerPropsMock: vi.fn(),
}));

vi.mock('../screen-data/useProjectAssignedUsers', () => ({
  useProjectAssignedUsers: () => projectUsersState,
}));

vi.mock('@/features/ui/avatar-band/AvatarBand', () => ({
  AvatarBand: (props: { users: { id: string }[] }) => (
    <div data-testid="avatar-band">
      {props.users.map((user) => (
        <span key={user.id}>{user.id}</span>
      ))}
    </div>
  ),
}));

vi.mock('@/features/ui/user-picker/UserPicker', () => ({
  UserPicker: (props: {
    disabled?: boolean;
    maxSelected?: number;
    onChange: (userIds: string[]) => void;
    value: string[];
  }) => {
    userPickerPropsMock(props);

    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange(['user-1', 'user-3', 'user-2'])}
      >
        picker
      </button>
    );
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = {
        'TopicWorkflow.overviewCard.assignment.peopleUnavailable':
          'Personen nicht verfuegbar',
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

describe('AvatarHeader', () => {
  beforeEach(() => {
    userPickerPropsMock.mockReset();
    projectUsersState.hasProjectUser = (userId: string) =>
      [
        'user-1',
        'user-2',
        'user-3',
        'user-4',
        'user-5',
        'user-6',
        'user-7',
        'user-8',
      ].includes(userId);
    projectUsersState.isOrganizationUsersError = false;
  });

  afterEach(cleanup);

  it('filters stale assignees, sorts by project user order, and caps visible people', () => {
    render(
      <AvatarHeader
        assignedUserIds={[
          'stale-user',
          'user-1',
          'user-8',
          'user-7',
          'user-6',
          'user-5',
          'user-4',
          'user-3',
          'user-2',
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('avatar-band').textContent).toBe(
      'user-2user-1user-3user-4user-5user-6user-7',
    );
    expect(userPickerPropsMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        maxSelected: 7,
        value: [
          'user-2',
          'user-1',
          'user-3',
          'user-4',
          'user-5',
          'user-6',
          'user-7',
        ],
      }),
    );
  });

  it('disables assignment editing and shows unavailable people on organization-user errors', () => {
    projectUsersState.isOrganizationUsersError = true;

    render(<AvatarHeader assignedUserIds={['user-1']} onChange={vi.fn()} />);

    expect(screen.getByText('Personen nicht verfuegbar')).toBeDefined();
    expect(userPickerPropsMock.mock.calls[0]?.[0].disabled).toBe(true);
  });

  it('emits changed assignees in project user order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AvatarHeader assignedUserIds={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'picker' }));

    expect(onChange).toHaveBeenCalledWith(['user-2', 'user-1', 'user-3']);
  });
});
