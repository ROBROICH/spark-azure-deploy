import type { NodeRef } from '@/db/nodes/types';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { Suspense } from 'react';
import { BaseNodeCard } from './node-cards/BaseNodeCard';

type SubgraphLoaderSelectedNodePanelProps = {
  nodeRef: NodeRef;
};

export function SubgraphLoaderSelectedNodePanel(
  props: SubgraphLoaderSelectedNodePanelProps,
) {
  return (
    <Suspense
      fallback={
        <p className="mt-4 text-xs text-neutral-500">
          Loading selected node...
        </p>
      }
    >
      <SubgraphLoaderSelectedNodePanelContent {...props} />
    </Suspense>
  );
}

function SubgraphLoaderSelectedNodePanelContent(
  props: SubgraphLoaderSelectedNodePanelProps,
) {
  const { nodeRef } = props;
  const { data } = useNode(nodeRef);

  if (!data) {
    return (
      <p className="mt-4 text-xs text-neutral-500">
        Selected node payload not loaded yet.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <BaseNodeCard node={data} />
    </div>
  );
}
