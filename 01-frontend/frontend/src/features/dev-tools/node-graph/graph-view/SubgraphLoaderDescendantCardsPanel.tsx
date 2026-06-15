import type { NodeRef } from '@/db/nodes/types';
import { Button } from '@/features/ui/button/Button';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { Suspense } from 'react';
import { BaseNodeCard } from './node-cards/BaseNodeCard';

type SubgraphLoaderDescendantCardsPanelProps = {
  descendantRefs: NodeRef[];
};

const route = getRouteApi('/verfahren/$verfahrenId/examination-dev');

export function SubgraphLoaderDescendantCardsPanel(
  props: SubgraphLoaderDescendantCardsPanelProps,
) {
  return (
    <Suspense
      fallback={
        <p className="mt-3 text-xs text-neutral-500">Loading descendants...</p>
      }
    >
      <SubgraphLoaderDescendantCardsPanelContent {...props} />
    </Suspense>
  );
}

function SubgraphLoaderDescendantCardsPanelContent(
  props: SubgraphLoaderDescendantCardsPanelProps,
) {
  const { descendantRefs } = props;
  const navigate = route.useNavigate();
  const { data } = useNodes(descendantRefs);

  if (data.length === 0) {
    return (
      <p className="mt-3 text-xs text-neutral-500">
        No descendant payloads loaded.
      </p>
    );
  }

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.map((node) => (
        <BaseNodeCard
          key={node.compositeKey}
          node={node}
          headerAction={
            <Button
              type="button"
              variant="ghost-light"
              size="sm"
              iconOnly
              aria-label={`Make ${node.node_type} ${node.id.slice(0, 8)} the selected top-level node`}
              onClick={() => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    selectedNodeId: node.id,
                    selectedNodeType: node.node_type,
                    showDescendants: undefined,
                  }),
                  replace: true,
                });
              }}
            >
              <ArrowUpRight />
            </Button>
          }
        />
      ))}
    </div>
  );
}
