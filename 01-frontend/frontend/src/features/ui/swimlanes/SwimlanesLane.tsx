import { useCallback, useId, useMemo, useState } from 'react';

import { cn } from '@/features/ui/style/cn';

import { SwimlaneHeader } from '../swimlane-header/SwimlaneHeader';
import { SwimlanesLaneHeaderOverrideContext } from './SwimlanesContext';
import type { SwimlanesLaneProps } from './swimlanes.types';

type SwimlanesLaneHeaderProps = Pick<
  SwimlanesLaneProps,
  | 'title'
  | 'icon'
  | 'headingLevel'
  | 'variant'
  | 'action'
  | 'headerChildren'
  | 'headerClassName'
> & {
  headingId: string;
  headerPortalTarget: HTMLDivElement | null;
  setHeaderPortalTarget: (target: HTMLDivElement | null) => void;
};

const SwimlanesLaneHeader = (props: SwimlanesLaneHeaderProps) => {
  const {
    title,
    icon,
    headingLevel,
    variant,
    action,
    headerChildren,
    headerClassName,
    headingId,
    headerPortalTarget,
    setHeaderPortalTarget,
  } = props;
  const hasHeaderOverride = headerPortalTarget !== null;

  return (
    <SwimlaneHeader
      icon={icon}
      title={title}
      headingLevel={headingLevel}
      headingId={headingId}
      variant={variant}
      action={action}
      className={headerClassName}
      hasOverrideContent={hasHeaderOverride}
      overrideContent={
        <div
          ref={setHeaderPortalTarget}
          className={hasHeaderOverride ? 'contents' : 'hidden'}
        />
      }
    >
      {headerChildren}
    </SwimlaneHeader>
  );
};

/**
 * A single swimlane panel. Renders a `SwimlaneHeader` at the top and
 * scrollable content below it.
 *
 * Can be used standalone inside `<Swimlanes>` or inside a
 * `<Swimlanes.Group>` (where it becomes a tab panel in collapsed mode).
 */
export const SwimlanesLane = (props: SwimlanesLaneProps) => {
  const {
    title,
    icon,
    headingLevel,
    variant,
    action,
    headerChildren,
    headerClassName,
    children,
    className,
  } = props;
  const headingId = useId();
  const [headerPortalTarget, setHeaderPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const [headerOverrideCount, setHeaderOverrideCount] = useState(0);

  // eslint-disable-next-line no-restricted-syntax -- the portal registration callbacks must stay stable so the header portal effect does not tear down and re-register on unrelated lane renders
  const registerHeaderOverride = useCallback(() => {
    setHeaderOverrideCount((currentCount) => currentCount + 1);
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- the portal registration callbacks must stay stable so the header portal effect does not tear down and re-register on unrelated lane renders
  const unregisterHeaderOverride = useCallback(() => {
    setHeaderOverrideCount((currentCount) => Math.max(0, currentCount - 1));
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- portal consumers rely on a stable context value until the header target or registration callbacks change
  const headerOverrideContextValue = useMemo(
    () => ({
      headerPortalTarget,
      registerHeaderOverride,
      unregisterHeaderOverride,
    }),
    [headerPortalTarget, registerHeaderOverride, unregisterHeaderOverride],
  );

  return (
    <SwimlanesLaneHeaderOverrideContext.Provider
      value={headerOverrideContextValue}
    >
      <section
        aria-labelledby={headingId}
        className={cn(
          'flex min-h-0 min-w-[var(--swimlane-min-w)] flex-1 flex-col bg-white',
          className,
        )}
      >
        <SwimlanesLaneHeader
          title={title}
          variant={variant}
          icon={icon}
          headingLevel={headingLevel}
          headingId={headingId}
          action={action}
          headerChildren={headerChildren}
          headerClassName={headerClassName}
          headerPortalTarget={
            headerOverrideCount > 0 ? headerPortalTarget : null
          }
          setHeaderPortalTarget={setHeaderPortalTarget}
        />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </section>
    </SwimlanesLaneHeaderOverrideContext.Provider>
  );
};
