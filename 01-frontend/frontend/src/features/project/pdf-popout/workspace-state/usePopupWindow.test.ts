import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePopupWindow } from './usePopupWindow';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('usePopupWindow', () => {
  it('returns a blocked result and keeps inline popup state when window.open returns null', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const onPopIn = vi.fn();

    const { result } = renderHook(() =>
      usePopupWindow({
        windowTitle: 'PDF documents',
        onPopIn,
      }),
    );

    let popOutResult: boolean | undefined;
    act(() => {
      popOutResult = result.current.popOut();
    });

    expect(popOutResult).toBe(false);
    expect(result.current.isPoppedOut).toBe(false);
    expect(result.current.popupRoot).toBeNull();
    expect(onPopIn).not.toHaveBeenCalled();
  });
});
