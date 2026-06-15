import { Children, isValidElement, useMemo, type ReactNode } from 'react';
import { CollapsedGroup, type LaneMeta } from './CollapsedGroup';
import { SwimlanesGroupContext } from './SwimlanesContext';
import { SwimlanesLane } from './SwimlanesLane';
import type {
  SwimlanesLaneProps,
  SwimlanesGroupProps,
} from './swimlanes.types';
import { useBreakpoint } from './useBreakpoint';

// ---------------------------------------------------------------------------
// Lane metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extracts lane metadata from `Swimlanes.Lane` children so the group can
 * render them as tab items + tab panels in collapsed mode.
 */
const extractLaneMetas = (children: ReactNode): LaneMeta[] => {
  const metas: LaneMeta[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement<SwimlanesLaneProps>(child)) {
      return;
    }
    if (child.type !== SwimlanesLane) {
      throw new Error(
        'Swimlanes.Group expects direct Swimlanes.Lane children.',
      );
    }

    metas.push({
      id: child.props.id,
      title: child.props.title,
      icon: child.props.icon,
      action: child.props.action,
      children: child.props.children,
    });
  });

  return metas;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Groups multiple `Swimlanes.Lane` children.
 *
 * - **Collapsed mode** (below `unfoldOn` breakpoint or no token set):
 *   Renders a single lane-width container with `SwimlaneTabs`.
 *   Each child `Lane` maps to one tab.
 *
 * - **Unfolded mode** (at or above `unfoldOn` breakpoint):
 *   Renders children as independent side-by-side lanes. No tab bar.
 *
 * If the group contains only one `Lane`, it renders as a normal lane
 * regardless of mode (a single lane never needs a tab bar).
 */
export const SwimlanesGroup = (props: SwimlanesGroupProps) => {
  const { unfoldOn, value, onValueChange, ariaLabel, children } = props;

  const breakpointMatches = useBreakpoint(unfoldOn);

  // No unfoldOn → always collapsed. With unfoldOn → unfolded when breakpoint matches.
  const isUnfolded = unfoldOn ? breakpointMatches : false;

  // eslint-disable-next-line no-restricted-syntax -- grouped swimlane consumers depend on a stable provider value when the breakpoint state has not changed
  const contextValue = useMemo(() => ({ isUnfolded }), [isUnfolded]);
  const laneMetas = extractLaneMetas(children);
  const activeValue = laneMetas.some((meta) => meta.id === value)
    ? value
    : (laneMetas[0]?.id ?? '');

  // Single lane in group → render as standalone lane, no tabs needed
  if (laneMetas.length <= 1 || isUnfolded) {
    return (
      <SwimlanesGroupContext.Provider value={contextValue}>
        {children}
      </SwimlanesGroupContext.Provider>
    );
  }

  // Collapsed → render as tabbed lane
  return (
    <SwimlanesGroupContext.Provider value={contextValue}>
      <CollapsedGroup
        laneMetas={laneMetas}
        value={activeValue}
        onValueChange={onValueChange}
        ariaLabel={ariaLabel}
      />
    </SwimlanesGroupContext.Provider>
  );
};
