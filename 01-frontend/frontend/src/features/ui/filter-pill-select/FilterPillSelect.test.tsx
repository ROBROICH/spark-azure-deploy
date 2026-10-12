import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterPillSelect } from './FilterPillSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock ActionMenu primitives so tests run without Radix portal issues.
// ActionMenuRadioGroup exposes test buttons that call onValueChange to simulate selection.
vi.mock('@/features/ui/action-menu/ActionMenu', () => ({
  ActionMenu: (props: { children: ReactNode }) => (
    <div data-testid="action-menu">{props.children}</div>
  ),
  ActionMenuTrigger: (props: { children: ReactNode; asChild?: boolean }) => (
    <>{props.children}</>
  ),
  ActionMenuContent: (props: { children: ReactNode }) => (
    <div data-testid="action-menu-content">{props.children}</div>
  ),
  ActionMenuRadioGroup: (props: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <div data-testid="radio-group" data-value={props.value}>
      <button
        type="button"
        data-testid="pick-option-a"
        onClick={() => props.onValueChange('option-a')}
      >
        pick a
      </button>
      <button
        type="button"
        data-testid="pick-option-b"
        onClick={() => props.onValueChange('option-b')}
      >
        pick b
      </button>
      {props.children}
    </div>
  ),
  ActionMenuRadioItem: () => null,
}));

afterEach(() => cleanup());

describe('FilterPillSelect — queryValue mapping', () => {
  const options = [
    { value: 'option-a', label: 'Option A', queryValue: 'query-a' as const },
    { value: 'option-b', label: 'Option B', queryValue: 'query-b' as const },
  ] as const;

  it('shows the label of the option whose queryValue matches the current value', () => {
    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={'query-a' as never}
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();
  });

  it('shows fallbackLabel when value does not match any queryValue', () => {
    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={undefined}
        fallbackLabel="All"
        onValueChange={() => {}}
      />,
    );

    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('calls onValueChange with the queryValue of the selected option, not the option value', () => {
    const onValueChange = vi.fn();

    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByTestId('pick-option-a'));

    expect(onValueChange).toHaveBeenCalledWith('query-a');
    expect(onValueChange).not.toHaveBeenCalledWith('option-a');
  });

  it('calls onValueChange with the second queryValue when the second option is selected', () => {
    const onValueChange = vi.fn();

    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByTestId('pick-option-b'));

    expect(onValueChange).toHaveBeenCalledWith('query-b');
  });

  it('passes the matching option.value (not queryValue) to the radio group so Radix marks it selected', () => {
    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={'query-a' as never}
        onValueChange={() => {}}
      />,
    );

    // The radio group receives option-a (the Radix-visible value), not query-a (the queryValue).
    // Without this mapping the popup would show no option as checked.
    expect(screen.getByTestId('radio-group')).toHaveAttribute(
      'data-value',
      'option-a',
    );
  });

  it('calls onValueChange with undefined when the clear button is clicked', () => {
    const onValueChange = vi.fn();

    render(
      <FilterPillSelect
        icon={<span>icon</span>}
        options={[...options]}
        value={'query-a' as never}
        onValueChange={onValueChange}
        clearable
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.resetFilter' }));

    expect(onValueChange).toHaveBeenCalledWith(undefined);
  });
});
