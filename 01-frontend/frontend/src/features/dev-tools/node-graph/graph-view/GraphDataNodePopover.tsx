import type { NodeRef } from '@/db/nodes/types';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { Suspense } from 'react';
import { BaseNodeCard } from './node-cards/BaseNodeCard';

type GraphDataNodePopoverProps = {
  anchor: {
    x: number;
    y: number;
  };
  nodeRef: NodeRef;
  viewport: {
    height: number;
    width: number;
  };
};

const POPOVER_WIDTH = 384;
const POPOVER_ESTIMATED_HEIGHT = 300;
const POPOVER_GAP = 16;
const POPOVER_MARGIN = 12;

function getPopoverPosition(props: GraphDataNodePopoverProps) {
  const { anchor, viewport } = props;
  const maxLeft = Math.max(
    POPOVER_MARGIN,
    viewport.width - POPOVER_WIDTH - POPOVER_MARGIN,
  );
  const preferredTop =
    anchor.y > viewport.height * 0.58
      ? anchor.y - POPOVER_ESTIMATED_HEIGHT - POPOVER_GAP
      : anchor.y + POPOVER_GAP;
  const maxTop = Math.max(
    POPOVER_MARGIN,
    viewport.height - POPOVER_ESTIMATED_HEIGHT - POPOVER_MARGIN,
  );

  return {
    left: Math.min(Math.max(anchor.x + POPOVER_GAP, POPOVER_MARGIN), maxLeft),
    top: Math.min(Math.max(preferredTop, POPOVER_MARGIN), maxTop),
  };
}

function GraphDataNodePopoverFallback(props: { nodeRef: NodeRef }) {
  const { nodeRef } = props;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-600 shadow-lg">
      Loading {nodeRef.node_type} payload for {nodeRef.id.slice(0, 8)}...
    </div>
  );
}

function GraphDataNodePopoverContent(props: { nodeRef: NodeRef }) {
  const { nodeRef } = props;
  const { data } = useNode(nodeRef);

  if (!data) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs text-neutral-600 shadow-lg">
        Node payload is not available yet.
      </div>
    );
  }

  return <BaseNodeCard node={data} />;
}

export function GraphDataNodePopover(props: GraphDataNodePopoverProps) {
  const position = getPopoverPosition(props);

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-10 w-96 max-w-[calc(100%-1.5rem)]"
      style={{
        transform: `translate(${position.left}px, ${position.top}px)`,
      }}
    >
      <Suspense
        fallback={<GraphDataNodePopoverFallback nodeRef={props.nodeRef} />}
      >
        <GraphDataNodePopoverContent nodeRef={props.nodeRef} />
      </Suspense>
    </div>
  );
}
