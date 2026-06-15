import { useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useSwimlanesLaneHeaderOverrideContext } from './SwimlanesContext';

export type SwimlaneHeaderPortalProps = {
  children: ReactNode;
};

/**
 * Renders lane header content into the header slot of the nearest swimlane.
 */
export const SwimlaneHeaderPortal = (props: SwimlaneHeaderPortalProps) => {
  const { children } = props;
  const context = useSwimlanesLaneHeaderOverrideContext();

  useLayoutEffect(() => {
    if (!context) {
      return;
    }

    context.registerHeaderOverride();

    return () => {
      context.unregisterHeaderOverride();
    };
  }, [context]);

  if (!context?.headerPortalTarget) {
    return null;
  }

  return createPortal(children, context.headerPortalTarget);
};
