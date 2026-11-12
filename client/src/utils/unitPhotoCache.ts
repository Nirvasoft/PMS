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
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/api/v1/')
  ) {
    return trimmed;
  }
  return `/api/v1${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
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
  const pushUnique = (u?: string | null) => {
    if (u && !list.includes(u)) list.push(u);
  };

  pushUnique(cached);
  pushUnique(src);

  // DigitalOcean Spaces CDN -> direct Spaces origin fallback
  const cdnMatch = src.match(/^https:\/\/([^/]+)\.cdn\.digitaloceanspaces\.com\/(.+)$/i);
  if (cdnMatch) {
    pushUnique(`https://${cdnMatch[1]}.digitaloceanspaces.com/${cdnMatch[2]}`);
  }

  // Spaces / absolute unit URL -> backend Spaces-streaming proxy fallback
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const unitMatch = src.match(/(?:^|\/)(units\/[0-9a-f-]+\/[0-9a-f-]+\/[^?#]+)(\?[^#]*)?$/i);
    if (unitMatch) {
      const unitPath = unitMatch[1];
      const query = unitMatch[2] || '';
      pushUnique(`/api/v1/uploads/${unitPath}${query}`);
      pushUnique(`/uploads/${unitPath}${query}`);
    }
  } else if (src.startsWith('/uploads/')) {
    pushUnique(`/api/v1${src}`);
  } else if (src.startsWith('/api/v1/uploads/')) {
    pushUnique(src.slice('/api/v1'.length));
  }

  return list;
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

export function hasFailedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl || rawPhotoUrl.startsWith('blob:')) return false;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  return Boolean(src && failedPhotoCache.has(src));
}

export function markUnitPhotoCached(rawPhotoUrl?: string | null, workingSrc?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const target = workingSrc || memoryPhotoCache.get(src) || src;
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
    const responseInit = file.type ? { headers: { 'Content-Type': file.type } } : undefined;
    window.caches
      .open(PHOTO_CACHE_NAME)
      .then((cache) => cache.put(src, new Response(file, responseInit)))
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

async function readBlobUrlFromCacheResponse(res: Response | undefined): Promise<string | null> {
  if (!res || !res.ok) return null;
  const blob = await res.blob();
  if (blob.size <= 0 || (blob.type && !blob.type.toLowerCase().startsWith('image/'))) {
    return null;
  }
  const blobUrl = URL.createObjectURL(blob);
  const ok = await loadSingleImageCandidate(blobUrl);
  if (ok) return blobUrl;
  URL.revokeObjectURL(blobUrl);
  return null;
}

export function preloadUnitPhoto(rawOrResolvedUrl?: string | null): Promise<string | null> {
  const src = resolveUnitPhotoSrc(rawOrResolvedUrl);
  if (!src) return Promise.resolve(null);

  const existing = memoryPhotoCache.get(src);
  if (existing) return Promise.resolve(existing);
  if (failedPhotoCache.has(src)) return Promise.resolve(null);

  const inflight = inflightPhotoCache.get(src);
  if (inflight) return inflight;

  const canUseBrowserCache =
    typeof window !== 'undefined' &&
    'caches' in window &&
    !src.startsWith('blob:') &&
    !src.startsWith('data:');

  const promise = (async () => {
    try {
      // 1. Exact match in CacheStorage (shared across Admin tab & Public Link tab)
      if (canUseBrowserCache) {
        try {
          const cache = await window.caches.open(PHOTO_CACHE_NAME);
          const exactBlobUrl = await readBlobUrlFromCacheResponse(await cache.match(src));
          if (exactBlobUrl) {
            markUnitPhotoCached(src, exactBlobUrl);
            return exactBlobUrl;
          }
        } catch {
          /* ignore CacheStorage read errors */
        }
      }

      // 2. Network candidates (Spaces CDN -> Spaces origin -> /api/v1/uploads proxy -> /uploads)
      const candidates = getUnitPhotoCandidates(rawOrResolvedUrl);
      for (const candidate of candidates) {
        const ok = await loadSingleImageCandidate(candidate);
        if (ok) {
          markUnitPhotoCached(src, candidate);
          return candidate;
        }
      }

      // 3. Fallback match by base path in CacheStorage if network candidates failed
      if (canUseBrowserCache) {
        try {
          const cache = await window.caches.open(PHOTO_CACHE_NAME);
          const basePath = new URL(src, window.location.origin).href.split('?')[0];
          const keys = await cache.keys();
          const matchedReq = keys.find((req) => req.url.split('?')[0] === basePath);
          if (matchedReq) {
            const fallbackBlobUrl = await readBlobUrlFromCacheResponse(await cache.match(matchedReq));
            if (fallbackBlobUrl) {
              markUnitPhotoCached(src, fallbackBlobUrl);
              return fallbackBlobUrl;
            }
          }
        } catch {
          /* ignore CacheStorage fallback errors */
        }
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
