import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserPicker, type UserPickerOption } from './UserPicker';

const users: UserPickerOption[] = [
  { id: 'user-1', label: 'User One' },
  { id: 'user-2', label: 'User Two' },
];
const usersWithDisabledOption: UserPickerOption[] = [
  { id: 'user-1', label: 'User One' },
  { id: 'user-2', label: 'User Two', disabled: true },
];

afterEach(() => cleanup());

describe('UserPicker', () => {
  it('links the built-in trigger to error text when invalid is true', () => {
    render(
      <UserPicker
        users={users}
        value={[]}
        onChange={() => {}}
        label="Assignee"
        placeholder="Select assignee"
        emptyLabel="No users"
        invalid
        aria-describedby="assignee-error"
        selectedCountLabel={(count) => `${count} selected`}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Assignee' });

    expect(trigger).toHaveAttribute('aria-describedby', 'assignee-error');
    expect(trigger).not.toHaveAttribute('aria-invalid');
    expect(trigger).not.toHaveAttribute('role', 'combobox');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('passes invalid and described-by state to custom triggers', () => {
    render(
      <UserPicker
        users={users}
        value={[]}
        onChange={() => {}}
        emptyLabel="No users"
        invalid
        aria-describedby="custom-error"
        trigger={<button type="button">Pick users</button>}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Pick users' });

    expect(trigger).toHaveAttribute('aria-describedby', 'custom-error');
    expect(trigger).not.toHaveAttribute('aria-invalid');
    expect(trigger).not.toHaveAttribute('role', 'combobox');
    expect(trigger).not.toHaveAttribute('aria-controls');
  });

  it('disables unselected users after maxSelected is reached but keeps selected users deselectable', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <UserPicker
        users={users}
        value={['user-1']}
        onChange={onChange}
        label="Assignee"
        placeholder="Select assignee"
        emptyLabel="No users"
        maxSelected={1}
        selectedCountLabel={(count) => `${count} selected`}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assignee' }));

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'User Two' }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'User Two' }),
    );
    expect(onChange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'User One' }),
    );
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not select disabled options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <UserPicker
        users={usersWithDisabledOption}
        value={[]}
        onChange={onChange}
        label="Assignee"
        placeholder="Select assignee"
        emptyLabel="No users"
        selectedCountLabel={(count) => `${count} selected`}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Assignee' }));

    expect(
      screen.getByRole('menuitemcheckbox', { name: 'User Two' }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'User Two' }),
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
