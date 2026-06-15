import { useMemo } from 'react';

import { cn } from '@/features/ui/style/cn';

import { SwimlaneHeaderPortal } from './SwimlaneHeaderPortal';
import { SwimlanesContext } from './SwimlanesContext';
import { SwimlanesGroup } from './SwimlanesGroup';
import { SwimlanesLane } from './SwimlanesLane';
import type { SwimlanesProps } from './swimlanes.types';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

const SwimlanesRoot = (props: SwimlanesProps) => {
  const { minLaneWidth = 200, children, className } = props;

  // eslint-disable-next-line no-restricted-syntax -- context providers need a stable value identity so swimlane consumers do not re-render on unrelated parent updates
  const contextValue = useMemo(
    () => ({
      minLaneWidth,
      manuallyAdjustWidth: false,
    }),
    [minLaneWidth],
  );

  return (
    <SwimlanesContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex min-h-0 flex-1 [&>*+*]:border-l [&>*+*]:border-l-border-primary',
          className,
        )}
        style={{ ['--swimlane-min-w' as string]: `${minLaneWidth}px` }}
      >
        {children}
      </div>
    </SwimlanesContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Compound component
// ---------------------------------------------------------------------------

/**
 * Reusable swimlane layout system.
 *
 * ```tsx
 * <Swimlanes minLaneWidth={320}>
 *   <Swimlanes.Group value={tab} onValueChange={setTab}>
 *     <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
 *       <DocumentsTree />
 *     </Swimlanes.Lane>
 *     <Swimlanes.Lane id="preview" title="Vorschau" icon={ScanText}>
 *       <DocumentViewer />
 *     </Swimlanes.Lane>
 *   </Swimlanes.Group>
 * </Swimlanes>
 * ```
 */
export const Swimlanes = Object.assign(SwimlanesRoot, {
  Group: SwimlanesGroup,
  Lane: SwimlanesLane,
  HeaderPortal: SwimlaneHeaderPortal,
});
