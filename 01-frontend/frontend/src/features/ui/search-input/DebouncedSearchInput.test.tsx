import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DebouncedSearchInput } from './DebouncedSearchInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DebouncedSearchInput', () => {
  it('debounces typed changes and clears immediately while cancelling pending changes', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    render(
      <DebouncedSearchInput
        value=""
        onChange={onChange}
        debounceMs={250}
        inputLabel="Search"
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
      target: { value: 'draft' },
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(249));
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('draft');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
      target: { value: 'next draft' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'searchInput.deleteSearch',
      }),
    );

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('');

    act(() => vi.advanceTimersByTime(250));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('limits the native search input length to 100 characters', () => {
    const onChange = vi.fn();

    render(
      <DebouncedSearchInput
        value=""
        onChange={onChange}
        debounceMs={250}
        inputLabel="Search"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Search' });

    expect(input).toHaveAttribute('maxLength', '100');
  });
});
