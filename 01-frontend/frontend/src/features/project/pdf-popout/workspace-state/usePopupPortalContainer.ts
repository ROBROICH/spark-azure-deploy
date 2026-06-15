import { useMemo, useState } from 'react';

/**
 * Manages a trigger element ref and derives the portal container from
 * the trigger's owner document. This is needed for cross-window rendering
 * where the popup portal must attach to the correct document body.
 *
 * @returns A ref callback for the trigger element and the resolved portal container.
 */
export const usePopupPortalContainer = () => {
  const [triggerElement, setTriggerElement] =
    // eslint-disable-next-line no-restricted-syntax -- triggerElement is a transient DOM ref used only to anchor the popover portal in the correct document
    useState<HTMLButtonElement | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- portalContainer derives from a DOM ref and must be stable across renders to avoid portal remounting
  const portalContainer = useMemo(
    () => triggerElement?.ownerDocument.body ?? undefined,
    [triggerElement],
  );

  return { triggerRef: setTriggerElement, portalContainer };
};
