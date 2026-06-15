import { useEffect, useRef, useState } from 'react';

export function useGraphViewport() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- graph viewport size is local browser layout state that tracks the host element for the imperative renderer
  const [viewport, setViewport] = useState({
    height: 0,
    width: 0,
  });

  // eslint-disable-next-line no-restricted-syntax -- ResizeObserver is the browser integration needed to keep the canvas backing store in sync with its responsive container
  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const updateViewport = () => {
      const rect = element.getBoundingClientRect();
      const nextHeight = Math.floor(rect.height);
      const nextWidth = Math.floor(rect.width);
      setViewport((currentViewport) =>
        currentViewport.height === nextHeight &&
        currentViewport.width === nextWidth
          ? currentViewport
          : {
              height: nextHeight,
              width: nextWidth,
            },
      );
    };

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state -- the initial viewport can only be read after the responsive canvas container exists in the DOM
    updateViewport();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(updateViewport);
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state -- ResizeObserver keeps viewport state synchronized with browser layout after mount
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return {
    containerRef,
    viewport,
  };
}
