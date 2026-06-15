import { createContext, useContext } from 'react';

// ---------------------------------------------------------------------------
// Swimlanes (root) context
// ---------------------------------------------------------------------------

export type SwimlanesContextValue = {
  /** Minimum lane width in pixels. */
  minLaneWidth: number;
  /**
   * Placeholder for future manual-resize mode.
   * `false` in Phase 1 -- resize behavior is deferred.
   */
  manuallyAdjustWidth: boolean;
};

export const SwimlanesContext = createContext<SwimlanesContextValue | null>(
  null,
);

// ---------------------------------------------------------------------------
// Group context (scaffolded for Slice 2)
// ---------------------------------------------------------------------------

export type SwimlanesGroupContextValue = {
  /** Whether the group is currently unfolded (side-by-side lanes). */
  isUnfolded: boolean;
};

export const SwimlanesGroupContext =
  createContext<SwimlanesGroupContextValue | null>(null);

// ---------------------------------------------------------------------------
// Lane header override context
// ---------------------------------------------------------------------------

export type SwimlanesLaneHeaderOverrideContextValue = {
  headerPortalTarget: HTMLElement | null;
  registerHeaderOverride: () => void;
  unregisterHeaderOverride: () => void;
};

export const SwimlanesLaneHeaderOverrideContext =
  createContext<SwimlanesLaneHeaderOverrideContextValue | null>(null);

export const useSwimlanesLaneHeaderOverrideContext = () =>
  useContext(SwimlanesLaneHeaderOverrideContext);
