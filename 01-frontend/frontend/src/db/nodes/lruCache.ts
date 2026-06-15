const get =
  <T>(entries: Map<string, T>) =>
  (key: string): T | undefined => {
    const value = entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    entries.delete(key);
    entries.set(key, value);
    return value;
  };

const set =
  <T>(entries: Map<string, T>, maxSize: number) =>
  (key: string, value: T): void => {
    entries.delete(key);
    if (entries.size >= maxSize) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        entries.delete(oldest);
      }
    }
    entries.set(key, value);
  };

export function createLruCache<T>(maxSize: number) {
  const entries = new Map<string, T>();

  return {
    get: get(entries),
    set: set(entries, maxSize),
  };
}
