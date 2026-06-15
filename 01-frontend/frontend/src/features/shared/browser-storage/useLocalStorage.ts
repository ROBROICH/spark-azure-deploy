import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { z } from 'zod';

type StorageKind = 'local' | 'session';

const getStorageArea = (storage: StorageKind) =>
  storage === 'session' ? window.sessionStorage : window.localStorage;

/**
 * Dispatches a custom storage event to notify listeners of localStorage changes.
 * @param key - The localStorage key that changed
 * @param newValue - The new value (stringified) or null if removed
 */
export function dispatchStorageEvent(
  key: string,
  newValue: string | null,
  storage: StorageKind = 'local',
) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  window.dispatchEvent(
    new CustomEvent('codex-storage', {
      detail: { key, storage },
    }),
  );
}

/**
 * Sets an item in localStorage and dispatches a storage event.
 * @param key - The localStorage key
 * @param value - The value to store (will be JSON stringified)
 */
const setStorageItem = <T>(storage: StorageKind, key: string, value: T) => {
  const stringifiedValue = JSON.stringify(value);
  getStorageArea(storage).setItem(key, stringifiedValue);
  dispatchStorageEvent(key, stringifiedValue, storage);
};

/**
 * Removes an item from localStorage and dispatches a storage event.
 * @param key - The localStorage key to remove
 */
const removeStorageItem = (storage: StorageKind, key: string) => {
  getStorageArea(storage).removeItem(key);
  dispatchStorageEvent(key, null, storage);
};

/**
 * Gets an item from localStorage.
 * @param key - The localStorage key
 * @returns The stored value as a string or null
 */
const getStorageItem = (storage: StorageKind, key: string) => {
  return getStorageArea(storage).getItem(key);
};

/**
 * Subscribes to storage events for cross-tab synchronization.
 * @param callback - Function to call when storage changes
 * @returns Cleanup function to unsubscribe
 */
const subscribeToLocalStorage = (callback: () => void) => {
  const handleStorage = () => {
    callback();
  };
  const handleCustomStorage = () => {
    callback();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('codex-storage', handleCustomStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('codex-storage', handleCustomStorage);
  };
};

/** Parses a raw storage string with validation. */
const parseLocalStorageValue = <T>(props: {
  initialValue: T;
  key: string;
  onError?: (
    error: unknown,
    context: { key: string; rawValue: string | null },
  ) => void;
  rawValue: string | null;
  schema: z.ZodType<T>;
}): T => {
  const { initialValue, key, onError, rawValue, schema } = props;

  if (rawValue === null) {
    return initialValue;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    return schema.parse(parsed);
  } catch (error) {
    onError?.(error, { key, rawValue });
    return initialValue;
  }
};

/**
 * Props for the useLocalStorage hook
 */
type UseLocalStorageProps<T, TSchema extends z.ZodType<T> = z.ZodType<T>> = {
  /** The localStorage key to use */
  key: string;
  /** Storage backend to use; defaults to localStorage */
  storage?: StorageKind;
  /** Initial value to use if the key doesn't exist or validation fails */
  initialValue: T;
  /** Zod schema for runtime validation */
  schema: TSchema;
  /** Callback function called when the value updates */
  onUpdate?: (value: T) => void;
  /** Callback function called when validation or parsing fails */
  onError?: (
    error: unknown,
    context: { key: string; rawValue: string | null },
  ) => void;
};

/**
 * React hook for syncing state with localStorage.
 * Provides automatic synchronization across tabs and sessions.
 * Validates values against a Zod schema.
 *
 * @template T - The type of the stored value
 * @template S - The Zod schema type
 * @param props - Configuration options for the hook
 * @returns A tuple of [value, setValue] similar to useState
 *
 * @example
 * ```tsx
 * // Primitive usage
 * const [isCollapsed, setIsCollapsed] = useLocalStorage({
 *   key: 'panel-collapsed',
 *   initialValue: false,
 *   schema: z.boolean()
 * });
 *
 * const userSchema = z.object({ name: z.string(), age: z.number() });
 * const [user, setUser] = useLocalStorage({
 *   key: 'user',
 *   initialValue: { name: 'Guest', age: 0 },
 *   schema: userSchema,
 *   onError: (error, { key }) => trackError({ message: 'localStorage error', data: { error, key } })
 * });
 * ```
 */
export function useLocalStorage<T, TSchema extends z.ZodType<T> = z.ZodType<T>>(
  props: UseLocalStorageProps<T, TSchema>,
) {
  const {
    key,
    storage = 'local',
    initialValue,
    schema,
    onUpdate,
    onError,
  } = props;
  const store = useSyncExternalStore(
    subscribeToLocalStorage,
    () => getStorageItem(storage, key),
    () => null,
  );

  // eslint-disable-next-line no-restricted-syntax -- Parsing validates an external-store snapshot and must preserve object identity while inputs are unchanged.
  const value = useMemo(
    () =>
      parseLocalStorageValue({
        rawValue: store,
        initialValue,
        key,
        onError,
        schema,
      }),
    [initialValue, key, onError, schema, store],
  );

  // eslint-disable-next-line no-restricted-syntax -- optional callback invocation after external store value changes; not derivable during render.
  useEffect(() => {
    onUpdate?.(value);
  }, [onUpdate, value]);

  // eslint-disable-next-line no-restricted-syntax -- this hook mirrors useState semantics, so the returned setter should keep a stable identity for consumers.
  const setState = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      try {
        const previous = parseLocalStorageValue({
          rawValue: getStorageItem(storage, key),
          initialValue,
          key,
          onError,
          schema,
        });
        const nextState =
          typeof newValue === 'function'
            ? (newValue as (prev: T) => T)(previous)
            : newValue;

        if (nextState === undefined || nextState === null) {
          removeStorageItem(storage, key);
          return;
        }

        schema.parse(nextState);

        setStorageItem(storage, key, nextState);
      } catch (error) {
        onError?.(error, { key, rawValue: JSON.stringify(newValue) });
      }
    },
    [initialValue, key, onError, schema, storage],
  );

  return [value, setState] as const;
}
