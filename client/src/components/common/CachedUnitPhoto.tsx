import { useEffect, useState, type ReactNode } from 'react';
import {
  getCachedUnitPhotoSrc,
  hasCachedUnitPhoto,
  markUnitPhotoCached,
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
  readyClassName?: string;
  loadingClassName?: string;
  forceLoading?: boolean;
}

/**
 * Reusable unit/shop photo component with unified cache lookup, skeleton shimmer,
 * and automatic cache marking on load.
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
  readyClassName = 'is-ready',
  loadingClassName = 'is-loading',
  forceLoading = false,
}: CachedUnitPhotoProps) {
  const [domLoadedUrl, setDomLoadedUrl] = useState<string | null>(null);
  const src = getCachedUnitPhotoSrc(photoUrl);
  const isReady = Boolean(
    photoUrl &&
      !forceLoading &&
      (photoUrl.startsWith('blob:') || hasCachedUnitPhoto(photoUrl) || domLoadedUrl === photoUrl),
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
          src={src}
          alt={alt}
          className={`${imgClassName} ${isReady ? readyClassName : loadingClassName}`}
          loading={loading}
          decoding="async"
          onLoad={() => {
            if (photoUrl) {
              markUnitPhotoCached(photoUrl);
              setDomLoadedUrl(photoUrl);
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
