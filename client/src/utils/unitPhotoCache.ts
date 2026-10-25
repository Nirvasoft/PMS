const PHOTO_CACHE_NAME = 'pms-unit-photos-v1';
const memoryPhotoCache = new Map<string, string>();
const inflightPhotoCache = new Map<string, Promise<string>>();
const cacheListeners = new Set<() => void>();

function notifyCacheListeners() {
  cacheListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function subscribeUnitPhotoCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

export function isUnitPhotoImage(rawPhotoUrl?: string | null): boolean {
  return Boolean(rawPhotoUrl && (rawPhotoUrl.startsWith('blob:') || /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(rawPhotoUrl)));
}

export function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName);
}

export function validateUnitPhotoFile(file: File): string | null {
  if (file.size > 10 * 1024 * 1024) {
    return 'Max file size is 10MB';
  }
  if (!/\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)) {
    return 'Only PDF, PNG, JPEG, WEBP, GIF allowed';
  }
  return null;
}

export function resolveUnitPhotoSrc(rawPhotoUrl?: string | null): string | null {
  if (!rawPhotoUrl || !isUnitPhotoImage(rawPhotoUrl)) return null;
  if (rawPhotoUrl.startsWith('http') || rawPhotoUrl.startsWith('blob:') || rawPhotoUrl.startsWith('/api/v1')) {
    return rawPhotoUrl;
  }
  return `/api/v1${rawPhotoUrl}`;
}

export function getCachedUnitPhotoSrc(rawPhotoUrl?: string | null): string | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  return memoryPhotoCache.get(src) || src;
}

export function hasCachedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl) return false;
  if (rawPhotoUrl.startsWith('blob:')) return true;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  return Boolean(src && memoryPhotoCache.has(src));
}

export function markUnitPhotoCached(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src || memoryPhotoCache.has(src)) return;
  memoryPhotoCache.set(src, src);
  notifyCacheListeners();
}

export function evictUnitPhotoCache(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const basePath = src.split('?')[0];

  for (const [key, val] of Array.from(memoryPhotoCache.entries())) {
    if (key === src || key.split('?')[0] === basePath) {
      if (val.startsWith('blob:')) {
        URL.revokeObjectURL(val);
      }
      memoryPhotoCache.delete(key);
    }
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    window.caches
      .open(PHOTO_CACHE_NAME)
      .then(async (cache) => {
        await cache.delete(src);
        const keys = await cache.keys();
        await Promise.all(
          keys
            .filter((req) => req.url.includes(basePath))
            .map((req) => cache.delete(req)),
        );
      })
      .catch(() => {});
  }
  notifyCacheListeners();
}

export function primeUnitPhotoCacheFromFile(rawPhotoUrl: string | null | undefined, file: Blob): string | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  const blobUrl = URL.createObjectURL(file);
  memoryPhotoCache.set(src, blobUrl);

  if (typeof window !== 'undefined' && 'caches' in window) {
    window.caches
      .open(PHOTO_CACHE_NAME)
      .then((cache) => cache.put(src, new Response(file)))
      .catch(() => {});
  }
  notifyCacheListeners();
  return blobUrl;
}

export function syncUploadedUnitPhotoCache(
  previousUrl: string | null | undefined,
  newUrl: string | null | undefined,
  file: File,
): void {
  if (previousUrl && previousUrl !== newUrl) {
    evictUnitPhotoCache(previousUrl);
  }
  if (newUrl && isImageFileName(file.name)) {
    primeUnitPhotoCacheFromFile(newUrl, file);
    markUnitPhotoCached(newUrl);
  }
}

export function preloadUnitPhoto(rawOrResolvedUrl?: string | null): Promise<string | null> {
  const src = resolveUnitPhotoSrc(rawOrResolvedUrl);
  if (!src) return Promise.resolve(null);

  const existing = memoryPhotoCache.get(src);
  if (existing) return Promise.resolve(existing);

  const inflight = inflightPhotoCache.get(src);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cache = await window.caches.open(PHOTO_CACHE_NAME);
        let res = await cache.match(src);
        if (!res) {
          const netRes = await fetch(src, { cache: 'force-cache' });
          if (netRes.ok) {
            await cache.put(src, netRes.clone());
            res = netRes;
          }
        }
        if (res) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.decoding = 'async';
          img.src = blobUrl;
          if (img.decode) await img.decode().catch(() => {});
          memoryPhotoCache.set(src, blobUrl);
          notifyCacheListeners();
          return blobUrl;
        }
      }
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      if (img.decode) await img.decode().catch(() => {});
      memoryPhotoCache.set(src, src);
      notifyCacheListeners();
      return src;
    } catch {
      memoryPhotoCache.set(src, src);
      notifyCacheListeners();
      return src;
    } finally {
      inflightPhotoCache.delete(src);
    }
  })();

  inflightPhotoCache.set(src, promise);
  return promise;
}

export async function preloadUnitPhotosBatch(
  rawUrls: Array<string | null | undefined>,
  onBatchComplete?: () => void,
): Promise<void> {
  const pending = Array.from(
    new Set(
      rawUrls
        .map((u) => resolveUnitPhotoSrc(u))
        .filter((src): src is string => Boolean(src && !memoryPhotoCache.has(src))),
    ),
  );
  if (pending.length === 0) return;
  await Promise.all(pending.map((src) => preloadUnitPhoto(src)));
  onBatchComplete?.();
}
