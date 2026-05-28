type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const getNow = () => Date.now();

const readRaw = (key: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
};

export const getTtlCache = <T>(key: string): T | null => {
  const rawValue = readRaw(key);

  if (!rawValue) {
    return null;
  }

  try {
    const entry = JSON.parse(rawValue) as CacheEntry<T>;

    if (!entry?.expiresAt || entry.expiresAt <= getNow()) {
      window.localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
};

export const setTtlCache = <T>(key: string, data: T, ttlMs: number) => {
  if (typeof window === "undefined") {
    return;
  }

  const entry: CacheEntry<T> = {
    data,
    expiresAt: getNow() + ttlMs,
  };

  window.localStorage.setItem(key, JSON.stringify(entry));
};

export const removeTtlCache = (key: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(key);
};
