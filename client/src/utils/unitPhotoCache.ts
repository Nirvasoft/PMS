const PHOTO_CACHE_NAME = 'pms-unit-photos-v1';
const memoryPhotoCache = new Map<string, string>();
const failedPhotoCache = new Set<string>();
const inflightPhotoCache = new Map<string, Promise<string | null>>();
const cacheListeners = new Set<() => void>();

let notifyScheduled = false;

function notifyCacheListeners() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  const flush = () => {
    notifyScheduled = false;
    cacheListeners.forEach((listener) => {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    });
  };
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(flush);
  } else {
    Promise.resolve().then(flush);
  }
}

export function subscribeUnitPhotoCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
}

export function isUnitPhotoImage(rawPhotoUrl?: string | null): boolean {
  return Boolean(
    rawPhotoUrl &&
      (rawPhotoUrl.startsWith('blob:') ||
        rawPhotoUrl.startsWith('data:image/') ||
        /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(rawPhotoUrl)),
  );
}

export function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(fileName);
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

export function resolveImageAssetUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return `/${trimmed}`;
}

export function resolveUnitAssetHref(rawUrl?: string | null): string {
  const src = resolveImageAssetUrl(rawUrl);
  if (!src) return '#';
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('blob:') ||
    src.startsWith('data:') ||
    src.startsWith('/api/v1/')
  ) {
    return src;
  }
  return `/api/v1${src}`;
}

export function resolveUnitPhotoSrc(rawPhotoUrl?: string | null): string | null {
  if (!rawPhotoUrl || !isUnitPhotoImage(rawPhotoUrl)) return null;
  return resolveImageAssetUrl(rawPhotoUrl);
}

export function getUnitPhotoCandidates(rawPhotoUrl?: string | null): string[] {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return [];
  const cached = memoryPhotoCache.get(src);
  const list: string[] = [];
  if (cached) list.push(cached);
  if (src.startsWith('/uploads/')) {
    const apiPrimary = `/api/v1${src}`;
    if (!list.includes(apiPrimary)) list.push(apiPrimary);
    if (!list.includes(src)) list.push(src);
  } else if (src.startsWith('/api/v1/uploads/')) {
    if (!list.includes(src)) list.push(src);
    const directFallback = src.slice('/api/v1'.length);
    if (!list.includes(directFallback)) list.push(directFallback);
  } else if (!list.includes(src)) {
    list.push(src);
  }
  return list;
}

export function getCachedUnitPhotoSrc(rawPhotoUrl?: string | null): string | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  return memoryPhotoCache.get(src) || (src.startsWith('/uploads/') ? `/api/v1${src}` : src);
}

export function hasCachedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl) return false;
  if (rawPhotoUrl.startsWith('blob:')) return true;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  return Boolean(src && memoryPhotoCache.has(src));
}

export function hasFailedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl || rawPhotoUrl.startsWith('blob:')) return false;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  return Boolean(src && failedPhotoCache.has(src));
}

export function markUnitPhotoCached(rawPhotoUrl?: string | null, workingSrc?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const target = workingSrc || memoryPhotoCache.get(src) || (src.startsWith('/uploads/') ? `/api/v1${src}` : src);
  const wasFailed = failedPhotoCache.delete(src);
  const prev = memoryPhotoCache.get(src);
  if (prev === target && !wasFailed) return;
  memoryPhotoCache.set(src, target);
  notifyCacheListeners();
}

export function markUnitPhotoFailed(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src || failedPhotoCache.has(src)) return;
  failedPhotoCache.add(src);
  notifyCacheListeners();
}

export function evictUnitPhotoCache(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const basePath = src.split('?')[0];

  failedPhotoCache.delete(src);
  for (const failedKey of Array.from(failedPhotoCache)) {
    if (failedKey === src || failedKey.split('?')[0] === basePath) {
      failedPhotoCache.delete(failedKey);
    }
  }

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
  failedPhotoCache.delete(src);
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
  }
}

async function readPhotoBlobFromCacheStorage(
  src: string,
  allowBasePathFallback = false,
): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await window.caches.open(PHOTO_CACHE_NAME);
    let response = await cache.match(src);
    if (!response && allowBasePathFallback) {
      const basePath = src.split('?')[0];
      const keys = await cache.keys();
      const matchedReq = keys.find((req) => req.url.includes(basePath));
      if (matchedReq) {
        response = await cache.match(matchedReq);
      }
    }
    if (!response) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function loadSingleImageCandidate(candidateUrl: string): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = candidateUrl;
    if (img.complete && img.naturalWidth > 0) {
      resolve(true);
    }
  });
}

export function preloadUnitPhoto(rawOrResolvedUrl?: string | null): Promise<string | null> {
  const src = resolveUnitPhotoSrc(rawOrResolvedUrl);
  if (!src) return Promise.resolve(null);

  const existing = memoryPhotoCache.get(src);
  if (existing) return Promise.resolve(existing);
  if (failedPhotoCache.has(src)) return Promise.resolve(null);

  const inflight = inflightPhotoCache.get(src);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const exactCachedBlob = await readPhotoBlobFromCacheStorage(src, false);
      if (exactCachedBlob) {
        markUnitPhotoCached(src, exactCachedBlob);
        return exactCachedBlob;
      }

      const candidates = getUnitPhotoCandidates(rawOrResolvedUrl);
      for (const candidate of candidates) {
        const ok = await loadSingleImageCandidate(candidate);
        if (ok) {
          markUnitPhotoCached(src, candidate);
          return candidate;
        }
      }

      const fallbackCachedBlob = await readPhotoBlobFromCacheStorage(src, true);
      if (fallbackCachedBlob) {
        markUnitPhotoCached(src, fallbackCachedBlob);
        return fallbackCachedBlob;
      }

      markUnitPhotoFailed(src);
      return null;
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
        .filter((src): src is string => Boolean(src && !memoryPhotoCache.has(src) && !failedPhotoCache.has(src))),
    ),
  );
  if (pending.length === 0) return;

  const concurrency = 6;
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (idx < pending.length) {
      const current = pending[idx++];
      await preloadUnitPhoto(current);
    }
  });
  await Promise.all(workers);
  onBatchComplete?.();
}
