import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  evictUnitPhotoCache,
  getCachedUnitPhotoSrc,
  getUnitPhotoCandidates,
  hasCachedUnitPhoto,
  hasFailedUnitPhoto,
  markUnitPhotoCached,
  markUnitPhotoFailed,
  preloadUnitPhoto,
  subscribeUnitPhotoCache,
} from '../../utils/unitPhotoCache';

/**
 * Subscribes a component to shared unit photo cache updates (preload, upload, replace, delete).
 */
export function useUnitPhotoCache(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    return subscribeUnitPhotoCache(() => {
      setTick((n) => n + 1);
    });
  }, []);
}

export interface CachedUnitPhotoProps {
  photoUrl?: string | null;
  alt: string;
  imgClassName: string;
  skeletonClassName?: string;
  skeletonChildren?: ReactNode;
  wrapperAs?: 'div' | 'span';
  wrapperClassName?: string;
  loading?: 'lazy' | 'eager';
  forceLoading?: boolean;
}

/**
 * Reusable unit/shop photo component with unified cache lookup, skeleton shimmer,
 * synchronous browser-cache detection, and automatic fallback on error.
 */
export function CachedUnitPhoto({
  photoUrl,
  alt,
  imgClassName,
  skeletonClassName,
  skeletonChildren,
  wrapperAs,
  wrapperClassName,
  loading = 'lazy',
  forceLoading = false,
}: CachedUnitPhotoProps) {
  useUnitPhotoCache();
  const [domLoadedUrl, setDomLoadedUrl] = useState<string | null>(null);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [hasError, setHasError] = useState(false);

  const isCached = hasCachedUnitPhoto(photoUrl);
  const isFailed = hasFailedUnitPhoto(photoUrl);
  const cachedSrc = getCachedUnitPhotoSrc(photoUrl);

  const candidates = useMemo(
    () => getUnitPhotoCandidates(photoUrl),
    [photoUrl, cachedSrc],
  );

  useEffect(() => {
    setCandidateIdx(0);
    setHasError(false);
    if (
      photoUrl &&
      !photoUrl.startsWith('blob:') &&
      !hasCachedUnitPhoto(photoUrl) &&
      !hasFailedUnitPhoto(photoUrl)
    ) {
      preloadUnitPhoto(photoUrl);
    }
  }, [photoUrl]);

  if (!forceLoading && (hasError || isFailed)) {
    return null;
  }

  const src = candidates[candidateIdx] || cachedSrc;
  const isReady = Boolean(
    photoUrl &&
      !forceLoading &&
      (photoUrl.startsWith('blob:') || isCached || domLoadedUrl === photoUrl),
  );

  const SkeletonTag = wrapperAs === 'span' ? 'span' : 'div';
  const content = (
    <>
      {skeletonClassName && (!isReady || !src) && (
        <SkeletonTag className={skeletonClassName} aria-hidden="true">
          {skeletonChildren}
        </SkeletonTag>
      )}
      {src && (
        <img
          ref={(el) => {
            if (el && el.complete && el.naturalWidth > 0 && photoUrl) {
              markUnitPhotoCached(photoUrl, src);
              if (domLoadedUrl !== photoUrl) {
                setDomLoadedUrl(photoUrl);
              }
            }
          }}
          src={src}
          alt={alt}
          className={`${imgClassName} ${isReady ? 'is-ready' : 'is-loading'}`}
          loading={loading}
          decoding="async"
          onLoad={() => {
            if (photoUrl) {
              markUnitPhotoCached(photoUrl, src);
              setDomLoadedUrl(photoUrl);
            }
          }}
          onError={() => {
            if (!photoUrl) return;
            if (src.startsWith('blob:')) {
              evictUnitPhotoCache(photoUrl);
            }
            if (candidateIdx + 1 < candidates.length) {
              setCandidateIdx((prev) => prev + 1);
            } else {
              markUnitPhotoFailed(photoUrl);
              setHasError(true);
            }
          }}
        />
      )}
    </>
  );

  if (wrapperAs === 'span') {
    return <span className={wrapperClassName}>{content}</span>;
  }
  if (wrapperAs === 'div') {
    return <div className={wrapperClassName}>{content}</div>;
  }
  return content;
}
