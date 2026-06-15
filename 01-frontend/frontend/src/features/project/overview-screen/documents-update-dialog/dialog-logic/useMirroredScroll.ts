import { useEffect, type RefObject } from 'react';

type UseMirroredScrollParams = {
  refA: RefObject<HTMLElement | null>;
  refB: RefObject<HTMLElement | null>;
  // Resubscribes whenever this value changes; used by callers to re-bind the
  // listeners after the underlying DOM structure (e.g., the diff tree) changes.
  resetSignal: unknown;
};

/**
 * Mirrors vertical scrolling between two scroll containers so a side-by-side
 * view stays aligned. The DOM is the source of truth here, so a native scroll
 * listener is the right integration point rather than render-derived state.
 *
 * @param params.refA First scroll container.
 * @param params.refB Second scroll container.
 * @param params.resetSignal Value the caller flips when the containers' content changes (the listeners are reattached on change).
 */
export const useMirroredScroll = (params: UseMirroredScrollParams): void => {
  const { refA, refB, resetSignal } = params;

  // eslint-disable-next-line no-restricted-syntax -- subscribing to native scroll events is the only way to mirror scrollTop between two DOM containers; React state cannot drive this without lag.
  useEffect(() => {
    const a = refA.current;
    const b = refB.current;
    if (!a || !b) {
      return;
    }

    let isSyncing = false;

    const sync = (source: HTMLElement, target: HTMLElement) => () => {
      if (isSyncing) {
        return;
      }
      isSyncing = true;
      target.scrollTop = source.scrollTop;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const onAScroll = sync(a, b);
    const onBScroll = sync(b, a);

    a.addEventListener('scroll', onAScroll, { passive: true });
    b.addEventListener('scroll', onBScroll, { passive: true });

    return () => {
      a.removeEventListener('scroll', onAScroll);
      b.removeEventListener('scroll', onBScroll);
    };
  }, [refA, refB, resetSignal]);
};
