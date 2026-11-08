// Tiny in-memory TTL cache for the unauthenticated public mall endpoints (directory, floor plan, QR).
// - Concurrent requests for the same key share one loader call (no thundering herd on the DB).
// - Failed loads are never cached.
// - Bounded size (oldest entry is dropped first) so random keys cannot grow memory.
// Per-process only: fine for a single instance; with several instances each keeps its own copy (TTL stays short).

interface Entry {
  value: unknown;
  expires: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedPublic<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const promise = loader()
    .then((value) => {
      store.delete(key);
      store.set(key, { value, expires: Date.now() + ttlMs });
      while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Drops cached public data of one property (admin edited layout / shop / unit status). */
export function invalidateMallPublicCache(propertyId: string): void {
  const prefix = `mall:${propertyId}:`;
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
