export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function browserStorage(): KeyValue {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      window.localStorage.setItem(key, value);
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        return;
      }
    },
  };
}

export function memoryStorage(seed: Record<string, string> = {}): KeyValue {
  const m = new Map(Object.entries(seed));
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}
