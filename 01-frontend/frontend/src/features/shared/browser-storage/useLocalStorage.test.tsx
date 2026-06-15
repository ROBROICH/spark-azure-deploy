import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { dispatchStorageEvent, useLocalStorage } from './useLocalStorage';

const preferencesSchema = z.object({
  hiddenColumns: z.array(z.string()),
});

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('falls back to the initial value and reports malformed stored values', () => {
    const onError = vi.fn();
    const initialValue = { hiddenColumns: ['status'] };
    window.localStorage.setItem(
      'table-preferences',
      JSON.stringify({ hiddenColumns: 'status' }),
    );

    const { result } = renderHook(() =>
      useLocalStorage({
        key: 'table-preferences',
        initialValue,
        schema: preferencesSchema,
        onError,
      }),
    );

    expect(result.current[0]).toBe(initialValue);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      key: 'table-preferences',
      rawValue: '{"hiddenColumns":"status"}',
    });
  });

  it('preserves parsed object and array identity across unchanged rerenders', () => {
    const initialValue: z.infer<typeof preferencesSchema> = {
      hiddenColumns: [],
    };
    window.localStorage.setItem(
      'table-preferences',
      JSON.stringify({ hiddenColumns: ['status', 'owner'] }),
    );

    const { rerender, result } = renderHook(() =>
      useLocalStorage({
        key: 'table-preferences',
        initialValue,
        schema: preferencesSchema,
      }),
    );
    const firstValue = result.current[0];
    const firstArray = firstValue.hiddenColumns;

    rerender();

    expect(result.current[0]).toBe(firstValue);
    expect(result.current[0].hiddenColumns).toBe(firstArray);
  });

  it('keeps initial object and array identity while unchanged storage is empty', () => {
    const initialValue = { hiddenColumns: ['topic'] };

    const { rerender, result } = renderHook(() =>
      useLocalStorage({
        key: 'table-preferences',
        initialValue,
        schema: preferencesSchema,
      }),
    );

    rerender();

    expect(result.current[0]).toBe(initialValue);
    expect(result.current[0].hiddenColumns).toBe(initialValue.hiddenColumns);
  });

  it('updates to a new parsed identity when the stored value changes', () => {
    const initialValue: z.infer<typeof preferencesSchema> = {
      hiddenColumns: [],
    };
    const { result } = renderHook(() =>
      useLocalStorage({
        key: 'table-preferences',
        initialValue,
        schema: preferencesSchema,
      }),
    );
    const firstValue = result.current[0];

    act(() => {
      window.localStorage.setItem(
        'table-preferences',
        JSON.stringify({ hiddenColumns: ['status'] }),
      );
      dispatchStorageEvent('table-preferences', '{"hiddenColumns":["status"]}');
    });

    expect(result.current[0]).not.toBe(firstValue);
    expect(result.current[0].hiddenColumns).toEqual(['status']);
  });
});
