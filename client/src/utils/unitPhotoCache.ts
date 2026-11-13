export interface UnitPhotoEdgeMeta {
  bgColor: string;
  isUniformBg: boolean;
}

const PHOTO_CACHE_NAME = 'pms-unit-photos-v1';
const memoryPhotoCache = new Map<string, string>();
const basePathPhotoCache = new Map<string, string>();
const photoEdgeMetaCache = new Map<string, UnitPhotoEdgeMeta>();
const failedPhotoCache = new Set<string>();
const inflightPhotoCache = new Map<string, Promise<string | null>>();
const serverSyncedBasePaths = new Set<string>();
const cacheListeners = new Set<() => void>();

let notifyScheduled = false;
let cacheStorageHydrationPromise: Promise<void> | null = null;

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

function getBasePath(src: string): string {
  const withoutQuery = src.split('?')[0];
  return withoutQuery.startsWith('/api/v1/uploads/')
    ? withoutQuery.slice('/api/v1'.length)
    : withoutQuery;
}

function lookupMemoryPhoto(src: string): string | undefined {
  return memoryPhotoCache.get(src) ?? basePathPhotoCache.get(getBasePath(src));
}

export function getUnitPhotoCandidates(rawPhotoUrl?: string | null): string[] {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return [];
  const cached = lookupMemoryPhoto(src);
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
  return lookupMemoryPhoto(src) || (src.startsWith('/uploads/') ? `/api/v1${src}` : src);
}

export function hasCachedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl) return false;
  if (rawPhotoUrl.startsWith('blob:')) return true;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  return Boolean(src && lookupMemoryPhoto(src));
}

export function hasFailedUnitPhoto(rawPhotoUrl?: string | null): boolean {
  if (!rawPhotoUrl || rawPhotoUrl.startsWith('blob:')) return false;
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return false;
  if (lookupMemoryPhoto(src)) return false;
  return failedPhotoCache.has(src);
}

export function markUnitPhotoCached(rawPhotoUrl?: string | null, workingSrc?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const basePath = getBasePath(src);
  const target = workingSrc || lookupMemoryPhoto(src) || (src.startsWith('/uploads/') ? `/api/v1${src}` : src);
  const wasFailed = failedPhotoCache.delete(src);
  const prev = memoryPhotoCache.get(src);
  if (prev === target && !wasFailed) return;
  memoryPhotoCache.set(src, target);
  if (target.startsWith('blob:') || !basePathPhotoCache.has(basePath)) {
    basePathPhotoCache.set(basePath, target);
  }
  notifyCacheListeners();
}

export function markUnitPhotoFailed(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src || lookupMemoryPhoto(src) || failedPhotoCache.has(src)) return;
  failedPhotoCache.add(src);
  notifyCacheListeners();
}

export function evictUnitPhotoCache(rawPhotoUrl?: string | null): void {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return;
  const basePath = getBasePath(src);

  failedPhotoCache.delete(src);
  for (const failedKey of Array.from(failedPhotoCache)) {
    if (failedKey === src || getBasePath(failedKey) === basePath) {
      failedPhotoCache.delete(failedKey);
    }
  }

  basePathPhotoCache.delete(basePath);
  for (const [key, val] of Array.from(memoryPhotoCache.entries())) {
    if (key === src || getBasePath(key) === basePath) {
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

function syncCachedBlobToServerIfMissing(basePath: string, blob: Blob, forceUpload = false): void {
  if (typeof window === 'undefined' || !basePath.startsWith('/uploads/units/')) return;
  if (!blob || blob.size === 0) return;
  if (!forceUpload && serverSyncedBasePaths.has(basePath)) return;
  serverSyncedBasePaths.add(basePath);

  const apiEndpoint = `/api/v1${basePath}`;
  void (async () => {
    try {
      if (!forceUpload) {
        const headRes = await fetch(apiEndpoint, { method: 'HEAD' });
        if (headRes.ok) return;
      }
      await fetch(apiEndpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': blob.type || 'image/jpeg',
        },
        body: blob,
      });
    } catch {
      serverSyncedBasePaths.delete(basePath);
    }
  })();
}

export function primeUnitPhotoCacheFromFile(rawPhotoUrl: string | null | undefined, file: Blob): string | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  const basePath = getBasePath(src);
  failedPhotoCache.delete(src);
  const blobUrl = URL.createObjectURL(file);
  memoryPhotoCache.set(src, blobUrl);
  basePathPhotoCache.set(basePath, blobUrl);

  if (typeof window !== 'undefined' && 'caches' in window) {
    window.caches
      .open(PHOTO_CACHE_NAME)
      .then((cache) => cache.put(src, new Response(file)))
      .catch(() => {});
  }
  syncCachedBlobToServerIfMissing(basePath, file, true);
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

export function hydrateAllUnitPhotosFromCacheStorage(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return Promise.resolve();
  }
  if (cacheStorageHydrationPromise) return cacheStorageHydrationPromise;

  cacheStorageHydrationPromise = (async () => {
    try {
      const cache = await window.caches.open(PHOTO_CACHE_NAME);
      const keys = await cache.keys();
      if (keys.length === 0) return;

      let addedAny = false;
      await Promise.all(
        keys.map(async (req) => {
          try {
            const urlObj = new URL(req.url, window.location.origin);
            const pathWithQuery = `${urlObj.pathname}${urlObj.search}`;
            const basePath = getBasePath(pathWithQuery);
            if (memoryPhotoCache.has(pathWithQuery) && basePathPhotoCache.has(basePath)) {
              return;
            }
            const response = await cache.match(req);
            if (!response) return;
            const blob = await response.blob();
            if (!blob || blob.size === 0) return;
            const blobUrl = URL.createObjectURL(blob);
            memoryPhotoCache.set(pathWithQuery, blobUrl);
            basePathPhotoCache.set(basePath, blobUrl);
            failedPhotoCache.delete(pathWithQuery);
            failedPhotoCache.delete(basePath);
            addedAny = true;

            // Sample edge color in background and auto-heal server DB/disk if missing
            void loadSingleImageCandidate(blobUrl, pathWithQuery);
            syncCachedBlobToServerIfMissing(basePath, blob, false);
          } catch {
            /* ignore single entry errors */
          }
        }),
      );

      if (addedAny) {
        notifyCacheListeners();
      }
    } catch {
      /* ignore CacheStorage open errors */
    }
  })();

  return cacheStorageHydrationPromise;
}

if (typeof window !== 'undefined' && 'caches' in window) {
  void hydrateAllUnitPhotosFromCacheStorage();
}

async function readPhotoBlobFromCacheStorage(
  src: string,
  allowBasePathFallback = false,
): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    await hydrateAllUnitPhotosFromCacheStorage();
    const fromMem = lookupMemoryPhoto(src);
    if (fromMem && fromMem.startsWith('blob:')) return fromMem;

    const cache = await window.caches.open(PHOTO_CACHE_NAME);
    let response = await cache.match(src);
    if (!response && allowBasePathFallback) {
      const basePath = getBasePath(src);
      const keys = await cache.keys();
      const matchedReq = keys.find((req) => req.url.includes(basePath));
      if (matchedReq) {
        response = await cache.match(matchedReq);
      }
    }
    if (!response) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;
    const basePath = getBasePath(src);
    const blobUrl = URL.createObjectURL(blob);
    memoryPhotoCache.set(src, blobUrl);
    basePathPhotoCache.set(basePath, blobUrl);
    syncCachedBlobToServerIfMissing(basePath, blob, false);
    return blobUrl;
  } catch {
    return null;
  }
}

let sharedSampleCanvas: HTMLCanvasElement | null = null;

export function sampleAndCacheUnitPhotoEdgeMeta(
  img: HTMLImageElement,
  rawPhotoUrl?: string | null,
): UnitPhotoEdgeMeta | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  const basePath = getBasePath(src);
  const existing = photoEdgeMetaCache.get(src) ?? photoEdgeMetaCache.get(basePath);
  if (existing) return existing;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h || typeof document === 'undefined') return null;

  try {
    const size = 16;
    if (!sharedSampleCanvas) {
      sharedSampleCanvas = document.createElement('canvas');
      sharedSampleCanvas.width = size;
      sharedSampleCanvas.height = size;
    }
    const ctx = sharedSampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    // Sample 8 perimeter points (4 inset corners + 4 edge midpoints)
    const coords: Array<[number, number]> = [
      [1, 1],
      [size - 2, 1],
      [1, size - 2],
      [size - 2, size - 2],
      [Math.floor(size / 2), 1],
      [Math.floor(size / 2), size - 2],
      [1, Math.floor(size / 2)],
      [size - 2, Math.floor(size / 2)],
    ];

    const samples: Array<[number, number, number]> = [];
    for (const [cx, cy] of coords) {
      const idx = (cy * size + cx) * 4;
      const a = data[idx + 3];
      if (a < 128) {
        samples.push([255, 255, 255]);
      } else {
        samples.push([data[idx], data[idx + 1], data[idx + 2]]);
      }
    }

    // Sort channels to take the median perimeter color (robust against 1-corner watermarks)
    const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
    const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
    const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
    const mid = Math.floor(samples.length / 2);
    const rMed = rs[mid];
    const gMed = gs[mid];
    const bMed = bs[mid];

    let matchingCount = 0;
    for (const [r, g, b] of samples) {
      const dist = Math.max(Math.abs(r - rMed), Math.abs(g - gMed), Math.abs(b - bMed));
      if (dist <= 32) matchingCount++;
    }

    const isNearWhite = rMed >= 242 && gMed >= 242 && bMed >= 242;
    const bgColor = isNearWhite ? '#ffffff' : `rgb(${rMed}, ${gMed}, ${bMed})`;
    const meta: UnitPhotoEdgeMeta = {
      bgColor,
      isUniformBg: matchingCount >= 6,
    };
    photoEdgeMetaCache.set(src, meta);
    photoEdgeMetaCache.set(basePath, meta);
    notifyCacheListeners();
    return meta;
  } catch {
    return null;
  }
}

export function getUnitPhotoEdgeMeta(rawPhotoUrl?: string | null): UnitPhotoEdgeMeta | null {
  const src = resolveUnitPhotoSrc(rawPhotoUrl);
  if (!src) return null;
  return photoEdgeMetaCache.get(src) ?? photoEdgeMetaCache.get(getBasePath(src)) ?? null;
}

function loadSingleImageCandidate(candidateUrl: string, rawPhotoUrl?: string | null): Promise<boolean> {
  if (typeof Image === 'undefined') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      sampleAndCacheUnitPhotoEdgeMeta(img, rawPhotoUrl ?? candidateUrl);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = candidateUrl;
    if (img.complete && img.naturalWidth > 0) {
      sampleAndCacheUnitPhotoEdgeMeta(img, rawPhotoUrl ?? candidateUrl);
      resolve(true);
    }
  });
}

function persistNetworkPhotoInCacheStorage(src: string, candidateUrl: string): void {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  if (candidateUrl.startsWith('blob:') || candidateUrl.startsWith('data:')) return;
  void (async () => {
    try {
      const res = await fetch(candidateUrl, { cache: 'force-cache' });
      if (!res.ok) return;
      const blob = await res.blob();
      if (!blob || blob.size === 0) return;
      const cache = await window.caches.open(PHOTO_CACHE_NAME);
      await cache.put(src, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } }));
    } catch {
      /* ignore background cache persistence errors */
    }
  })();
}

export function preloadUnitPhoto(rawOrResolvedUrl?: string | null): Promise<string | null> {
  const src = resolveUnitPhotoSrc(rawOrResolvedUrl);
  if (!src) return Promise.resolve(null);

  const existing = lookupMemoryPhoto(src);
  if (existing) return Promise.resolve(existing);
  if (failedPhotoCache.has(src)) return Promise.resolve(null);

  const inflight = inflightPhotoCache.get(src);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      await hydrateAllUnitPhotosFromCacheStorage();
      const hydrated = lookupMemoryPhoto(src);
      if (hydrated) {
        markUnitPhotoCached(src, hydrated);
        return hydrated;
      }

      const exactCachedBlob = await readPhotoBlobFromCacheStorage(src, true);
      if (exactCachedBlob) {
        markUnitPhotoCached(src, exactCachedBlob);
        return exactCachedBlob;
      }

      const candidates = getUnitPhotoCandidates(rawOrResolvedUrl);
      for (const candidate of candidates) {
        const ok = await loadSingleImageCandidate(candidate, rawOrResolvedUrl);
        if (ok) {
          markUnitPhotoCached(src, candidate);
          persistNetworkPhotoInCacheStorage(src, candidate);
          return candidate;
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
  await hydrateAllUnitPhotosFromCacheStorage();

  const pending = Array.from(
    new Set(
      rawUrls
        .map((u) => resolveUnitPhotoSrc(u))
        .filter((src): src is string => Boolean(src && !lookupMemoryPhoto(src) && !failedPhotoCache.has(src))),
    ),
  );
  if (pending.length === 0) {
    onBatchComplete?.();
    return;
  }

  const concurrency = 8;
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

