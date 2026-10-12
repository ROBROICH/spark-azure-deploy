import { NODE_TYPE_LITERALS } from '@/db/nodes/nodeTypeLabels';
import type { NodeRef, NodeSummary, NodeTypeLiteral } from '@/db/nodes/types';
import { Button } from '@/features/ui/button/Button';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { getRouteApi } from '@tanstack/react-router';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { NodeUuidSearch } from './NodeUuidSearch';
import { SubgraphLoaderDescendantCardsPanel } from './SubgraphLoaderDescendantCardsPanel';
import { SubgraphLoaderNodeIdSelect } from './SubgraphLoaderNodeIdSelect';
import { SubgraphLoaderSelectedNodePanel } from './SubgraphLoaderSelectedNodePanel';

const route = getRouteApi('/verfahren/$verfahrenId/examination-dev');

const nodeTypeItems = NODE_TYPE_LITERALS.map((type) => ({
  value: type,
  label: type,
}));

/**
 * Lets developers inspect targeted examination payload loads without eager fetches.
 */
export function SubgraphLoader() {
  const { selectedGraphNodeId, selectedNodeId, selectedNodeType } =
    route.useSearch();
  const navigate = route.useNavigate();
  const { getNodesByType, getDescendants, index } = useGraph();
  const selectedGraphNode = selectedGraphNodeId
    ? (index.nodeById.get(selectedGraphNodeId) ?? null)
    : null;
  const effectiveSelectedNodeId = selectedGraphNodeId || selectedNodeId;
  const effectiveSelectedNodeType =
    selectedGraphNode?.nodeType ?? selectedNodeType;

  const nodesOfType = getNodesByType(effectiveSelectedNodeType);
  const nodeIdItems = nodesOfType.map((n) => ({
    value: n.id,
    label: n.id.slice(0, 12),
  }));

  const handleTypeChange = (value: NodeTypeLiteral) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedGraphNodeId: '',
        selectedNodeType: value,
        selectedNodeId: '',
        showDescendants: undefined,
      }),
      replace: true,
    });
  };

  const handleNodeChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedGraphNodeId: value,
        selectedNodeId: value,
        showDescendants: undefined,
      }),
      replace: true,
    });
  };

  const handleAnyNodeSelect = (node: NodeSummary) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedGraphNodeId: node.id,
        selectedNodeId: node.id,
        selectedNodeType: node.nodeType,
        showDescendants: undefined,
      }),
      replace: true,
    });
  };

  const handleClearNodeSelection = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedGraphNodeId: '',
        selectedNodeId: '',
        showDescendants: undefined,
      }),
      replace: true,
    });
  };

  const selectedNodeRef: NodeRef | null = effectiveSelectedNodeId
    ? (index.nodeById.get(effectiveSelectedNodeId) ?? null)
    : null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <span className="mb-3 block text-sm font-medium">Browse Nodes</span>

      <NodeUuidSearch
        className="mb-4 max-w-3xl"
        helperText="Paste any full node UUID to load its payload."
        label="Find node by UUID"
        nodeById={index.nodeById}
        onClear={handleClearNodeSelection}
        onSelectNode={handleAnyNodeSelect}
        placeholder="Paste any node UUID"
        selectedNodeId={selectedGraphNodeId}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Node Type</span>
          <SelectMenu
            items={nodeTypeItems}
            value={effectiveSelectedNodeType}
            onChange={(v) => handleTypeChange(v as NodeTypeLiteral)}
            triggerClassName="h-8 min-w-45 px-2 text-xs"
          />
        </div>

        <SubgraphLoaderNodeIdSelect
          key={effectiveSelectedNodeType}
          nodeIdItems={nodeIdItems}
          nodesOfTypeCount={nodesOfType.length}
          onNodeChange={handleNodeChange}
          selectedNodeId={effectiveSelectedNodeId}
        />
      </div>

      {selectedNodeRef && (
        <>
          <SubgraphLoaderSelectedNodePanel
            key={`${selectedNodeRef.nodeType}:${selectedNodeRef.id}`}
            nodeRef={selectedNodeRef}
          />
          <SatzDescendantsPanel
            key={`descendants-${selectedNodeRef.nodeType}:${selectedNodeRef.id}`}
            nodeRef={selectedNodeRef}
            getDescendants={getDescendants}
          />
        </>
      )}
    </div>
  );
}

/**
 * Shows descendant counts and the URL-backed load trigger for the currently
 * selected top-level node.
 */
function SatzDescendantsPanel(props: {
  nodeRef: NodeRef;
  getDescendants: (nodeId: string) => NodeRef[];
}) {
  const { nodeRef, getDescendants } = props;
  const { selectedDescendantType, showDescendants } = route.useSearch();
  const navigate = route.useNavigate();
  const descendantRefs = useDescendants(selectedDescendantType, nodeRef);

  const allDescendants = getDescendants(nodeRef.id).filter(
    (ref) => ref.id !== nodeRef.id,
  );
  const descendantCountsByType = new Map<NodeTypeLiteral, number>();
  for (const ref of allDescendants) {
    descendantCountsByType.set(
      ref.nodeType,
      (descendantCountsByType.get(ref.nodeType) ?? 0) + 1,
    );
  }
  const availableDescendantTypeItems = nodeTypeItems
    .filter((item) => descendantCountsByType.has(item.value))
    .flatMap((item) => {
      const count = descendantCountsByType.get(item.value);

      if (count === undefined) {
        return [];
      }

      return [
        {
          ...item,
          count,
        },
      ];
    });

  const handleDescendantTypeChange = (value: NodeTypeLiteral) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedDescendantType: value,
        showDescendants: undefined,
      }),
      replace: true,
    });
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <span className="text-xs text-neutral-500">
          {descendantRefs.length} {selectedDescendantType} found
        </span>

        <div className="flex min-w-45 flex-col gap-1">
          <span className="text-xs text-neutral-500">
            Descendant Type{' '}
            <span className="text-neutral-400">(of selected node)</span>
          </span>
          <SelectMenu
            items={availableDescendantTypeItems.map((item) => ({
              value: item.value,
              label: `${item.label} (${item.count})`,
            }))}
            value={selectedDescendantType}
            onChange={(v) => handleDescendantTypeChange(v as NodeTypeLiteral)}
            triggerClassName="h-8 px-2 text-xs"
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            navigate({
              search: (prev) => ({
                ...prev,
                showDescendants: true,
              }),
              replace: true,
            });
          }}
          disabled={descendantRefs.length === 0}
        >
          Load Descendants
        </Button>
      </div>

      {showDescendants && (
        <SubgraphLoaderDescendantCardsPanel
          key={`${selectedDescendantType}:${nodeRef.id}`}
          descendantRefs={descendantRefs}
        />
      )}
    </div>
  );
}
