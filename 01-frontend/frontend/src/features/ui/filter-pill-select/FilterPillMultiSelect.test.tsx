import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterPillMultiSelect } from './FilterPillMultiSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/features/ui/action-menu/ActionMenu', () => ({
  ActionMenu: (props: { children: ReactNode }) => {
    const { children } = props;

    return <div>{children}</div>;
  },
  ActionMenuCheckboxItem: (props: {
    checked?: boolean;
    children: ReactNode;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => {
    const {
      checked = false,
      children,
      disabled = false,
      onCheckedChange,
      onSelect,
    } = props;

    return (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => {
          onSelect?.({ preventDefault: vi.fn() });
          onCheckedChange?.(!checked);
        }}
      >
        {children}
      </button>
    );
  },
  ActionMenuContent: (props: { children: ReactNode; className?: string }) => {
    const { children, className } = props;

    return <div className={className}>{children}</div>;
  },
  ActionMenuTrigger: (props: { children: ReactNode }) => {
    const { children } = props;

    return <>{children}</>;
  },
}));

afterEach(() => cleanup());

describe('FilterPillMultiSelect', () => {
  it('shows the selected count on the trigger by default', () => {
    render(
      <FilterPillMultiSelect
        icon={<span aria-hidden="true">icon</span>}
        label="Status"
        value={['open', 'done']}
        onValueChange={() => undefined}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Status (2)' }),
    ).toBeInTheDocument();
  });

  it('adds and removes values without closing checkbox selection behavior', () => {
    const onValueChange = vi.fn();

    render(
      <FilterPillMultiSelect
        icon={<span aria-hidden="true">icon</span>}
        label="Status"
        value={['open']}
        onValueChange={onValueChange}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'done', label: 'Done' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Done' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Open' }));

    expect(onValueChange).toHaveBeenNthCalledWith(1, ['open', 'done']);
    expect(onValueChange).toHaveBeenNthCalledWith(2, []);
  });

  it('clears values and stops the clear click from reaching the trigger group', () => {
    const onValueChange = vi.fn();
    const onBubbledClick = vi.fn();

    document.body.addEventListener('click', onBubbledClick);

    render(
      <div>
        <FilterPillMultiSelect
          icon={<span aria-hidden="true">icon</span>}
          label="Documents"
          value={['doc-a']}
          onValueChange={onValueChange}
          options={[{ value: 'doc-a', label: 'Document A' }]}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.resetFilter' }));
    document.body.removeEventListener('click', onBubbledClick);

    expect(onValueChange).toHaveBeenCalledWith([]);
    expect(onBubbledClick).not.toHaveBeenCalled();
  });

  it('renders a disabled trigger without an active menu or clear button', () => {
    render(
      <FilterPillMultiSelect
        icon={<span aria-hidden="true">icon</span>}
        label="Documents"
        value={['doc-a']}
        onValueChange={() => undefined}
        disabled
        options={[{ value: 'doc-a', label: 'Document A' }]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Documents (1)' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.queryByRole('button', { name: 'common.resetFilter' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Document A')).not.toBeInTheDocument();
  });

  it('shows the empty menu state when no options are available', () => {
    render(
      <FilterPillMultiSelect
        icon={<span aria-hidden="true">icon</span>}
        label="Documents"
        value={[]}
        onValueChange={() => undefined}
        emptyLabel="No documents"
        options={[]}
      />,
    );

    expect(screen.getByText('No documents')).toBeInTheDocument();
  });

  it('supports ReactNode labels for long wrapping option content', () => {
    render(
      <FilterPillMultiSelect
        icon={<span aria-hidden="true">icon</span>}
        label="Documents"
        value={[]}
        onValueChange={() => undefined}
        options={[
          {
            value: 'doc-a',
            label: <span>Very long document name that may wrap</span>,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('menuitemcheckbox', {
        name: 'Very long document name that may wrap',
      }),
    ).toBeInTheDocument();
  });
});
