import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

type DynamicAssetName = 'owl-404' | 'owl-error';

type DynamicAssetProps = {
  className?: string;
  name: DynamicAssetName;
};

const videoAvailabilitySchema = z.enum(['available', 'missing']).nullable();

type VideoAvailability = z.infer<typeof videoAvailabilitySchema>;

const VIDEO_AVAILABILITY_STORAGE_KEY_PREFIX =
  'dynamic-asset:video-availability:';

const getDynamicAssetUrl = (name: DynamicAssetName, extension: 'mp4' | 'png') =>
  `${import.meta.env.BASE_URL}${extension === 'mp4' ? 'videos/' : ''}${name}.${extension}`;

const getAbsoluteUrl = (url: string) => {
  if (typeof window === 'undefined') {
    return url;
  }

  return new URL(url, window.location.href).href;
};

const getVideoAvailabilityStorageKey = (videoSrc: string) =>
  `${VIDEO_AVAILABILITY_STORAGE_KEY_PREFIX}${getAbsoluteUrl(videoSrc)}`;

const isReachableVideoResponse = (response: Response) => {
  if (!response.ok) {
    return false;
  }

  const contentType = response.headers
    .get('content-type')
    ?.split(';')
    .at(0)
    ?.trim()
    .toLowerCase();

  return (
    contentType?.startsWith('video/') ||
    contentType === 'application/octet-stream'
  );
};

const probeVideoAvailability = async (
  videoSrc: string,
  signal: AbortSignal,
): Promise<VideoAvailability> => {
  const response = await fetch(videoSrc, {
    method: 'HEAD',
    signal,
  });

  return isReachableVideoResponse(response) ? 'available' : 'missing';
};

/**
 * Renders a decorative public PNG/MP4 asset while preserving a PNG fallback for
 * reduced motion users and deliveries where the MP4 file is missing.
 */
export function DynamicAsset(props: DynamicAssetProps) {
  const { className, name } = props;
  const imageSrc = getDynamicAssetUrl(name, 'png');
  const videoSrc = getDynamicAssetUrl(name, 'mp4');
  const prefersReducedMotion = usePrefersReducedMotion();
  const [failedVideoSrc, setFailedVideoSrc] = useState<string | null>(null);
  const [videoAvailability, setVideoAvailability] = useLocalStorage({
    key: getVideoAvailabilityStorageKey(videoSrc),
    initialValue: null as VideoAvailability,
    schema: videoAvailabilitySchema,
  });
  const videoElementFailed = failedVideoSrc === videoSrc;

  // eslint-disable-next-line no-restricted-syntax -- MP4 reachability is an external browser resource check and must run after render.
  useEffect(() => {
    if (prefersReducedMotion || videoAvailability !== null) {
      return;
    }

    if (typeof fetch !== 'function') {
      setVideoAvailability('missing');
      return;
    }

    const abortController = new AbortController();

    void probeVideoAvailability(videoSrc, abortController.signal)
      .then((nextVideoAvailability) => {
        if (!abortController.signal.aborted) {
          setVideoAvailability(nextVideoAvailability);
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setVideoAvailability('missing');
        }
      });

    return () => {
      abortController.abort();
    };
  }, [prefersReducedMotion, setVideoAvailability, videoAvailability, videoSrc]);

  if (
    !prefersReducedMotion &&
    videoAvailability === 'available' &&
    !videoElementFailed
  ) {
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className={className}
        aria-hidden="true"
        onError={() => {
          setFailedVideoSrc(videoSrc);
        }}
      >
        <source src={videoSrc} type="video/mp4" />
      </video>
    );
  }

  return (
    <img
      src={imageSrc}
      loading="lazy"
      decoding="async"
      className={className}
      alt=""
      aria-hidden="true"
    />
  );
}
