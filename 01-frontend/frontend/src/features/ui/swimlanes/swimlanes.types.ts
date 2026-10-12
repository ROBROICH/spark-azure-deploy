import type { ElementType, ReactElement, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Breakpoint tokens
// ---------------------------------------------------------------------------

/**
 * Named breakpoint tokens for `unfoldOn`.
 * Values are centralized here so they can be tuned without touching page code.
 */
export const SWIMLANE_BREAKPOINTS = {
  always: '(min-width: 0px)',
  desktop: '(min-width: 1600px)',
  widescreen: '(min-width: 2000px)',
} as const;

export type SwimlanesBreakpointToken = keyof typeof SWIMLANE_BREAKPOINTS;

/** Minimum lane width (px) before the swimlane row scrolls instead of shrinking. */
export const SWIMLANE_MIN_LANE_WIDTH = 330;

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export type SwimlanesProps = {
  /** Minimum width (in px) before a lane is allowed to shrink further. */
  minLaneWidth?: number;
  children: ReactNode;
  className?: string;
};

export type SwimlanesGroupProps = {
  /**
   * Breakpoint token at which grouped lanes unfold from tabs into
   * side-by-side lanes.
   *
   * - `'always'`     -> `min-width: 0px`
   * - `'desktop'`    -> `min-width: 1600px`
   * - `'widescreen'` -> `min-width: 2000px`
   *
   * When omitted the group always renders in collapsed (tabbed) mode.
   */
  unfoldOn?: SwimlanesBreakpointToken;
  /** Active tab value. Must match a child `Lane` `id`. */
  value: string;
  /** Callback fired when the active tab changes. */
  onValueChange: (value: string) => void;
  /** Accessible label for the tab list rendered in collapsed mode. */
  ariaLabel?: string;
  children: SwimlanesLaneElement | SwimlanesLaneElement[];
};

export type SwimlanesLaneProps = {
  /** Unique identifier for the lane (used as tab value in grouped mode). */
  id: string;
  /**
   * Display title rendered in the lane header and exposed as the section
   * accessible name (via `aria-labelledby`). Must be unique per lane on a page.
   */
  title: string;
  /** Icon component rendered in the lane header. */
  icon: ElementType;
  /** Heading level for the title. Defaults to `'h2'`. */
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  /** Visual variant for the lane header. Use `'ai'` for the purple AI style. */
  variant?: 'ai';
  /** Optional action element rendered at the far right of the header. */
  action?: ReactNode;
  /** Optional extra controls rendered between the title and action in the header. */
  headerChildren?: ReactNode;
  /** Content rendered in the lane body. */
  children?: ReactNode;
  className?: string;
  /** Optional className merged into the lane header container (e.g. `flex-wrap`). */
  headerClassName?: string;
};

export type SwimlanesLaneElement = ReactElement<SwimlanesLaneProps>;
