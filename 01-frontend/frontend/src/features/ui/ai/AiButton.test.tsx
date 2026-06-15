import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiButton } from './AiButton';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AiButton', () => {
  it('fires the first click and locks duplicate clicks until the timeout expires', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();

    render(<AiButton label="KI-Analyse starten" onClick={onClick} />);

    const button = screen.getByRole('button', {
      name: 'KI-Analyse starten',
    });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('marks externally disabled buttons as unavailable without busy state', () => {
    const onClick = vi.fn();

    render(
      <AiButton isDisabled label="KI-Analyse starten" onClick={onClick} />,
    );

    const button = screen.getByRole('button', {
      name: 'KI-Analyse starten',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');

    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks loading buttons as disabled and busy', () => {
    render(<AiButton isLoading label="KI-Analyse starten" />);

    const button = screen.getByRole('button', {
      name: 'KI-Analyse starten',
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('clears the pending unlock timeout on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = render(<AiButton label="KI-Analyse starten" />);

    fireEvent.click(screen.getByRole('button', { name: 'KI-Analyse starten' }));
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });
});
