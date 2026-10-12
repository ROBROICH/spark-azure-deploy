import { getRouteApi } from '@tanstack/react-router';
import {
  type D3ZoomEvent,
  scaleSqrt,
  select,
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawGraphDataCanvas } from './graphDataCanvasRenderer';
import { GraphDataNodePopover } from './GraphDataNodePopover';
import { buildGraphDataScene } from './graphDataScene.logic';
import {
  buildDescendantScopedGraph,
  buildTopicScopedGraph,
} from './graphDataTopic.logic';
import {
  buildGraphDataLayout,
  findNearestGraphDataNode,
  getGraphDataFitTransform,
} from './graphDataView.logic';
import { GraphDataViewHeader } from './GraphDataViewHeader';
import { buildTypeLevelGraphLayout } from './typeLevelGraph.logic';
import { TypeLevelGraphViewLegend } from './TypeLevelGraphViewLegend';
import { useGraphViewport } from './useCanvasViewport';
import type { useNodeGraph } from '../graph-data/useNodeGraph';

const route = getRouteApi('/verfahren/$verfahrenId/examination-dev');
const MIN_RELATIVE_ZOOM = 0.85;
const MAX_RELATIVE_ZOOM = 5.2;
const DEFAULT_RADIUS = 18;
const LARGE_RADIUS = 32;

type GraphDataViewProps = {
  graphResult: ReturnType<typeof useNodeGraph>;
};

/**
 * Renders a large graph through canvas so actual node fan-out does not mount
 * thousands of React/SVG nodes while zooming and panning.
 */
export function GraphDataView(props: GraphDataViewProps) {
  const { graph, getDescendants, index, topics } = props.graphResult;
  const { graphDataTopicId, selectedGraphNodeId } = route.useSearch();
  const navigate = route.useNavigate();
  const { containerRef, viewport } = useGraphViewport();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<
    HTMLCanvasElement,
    unknown
  > | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- D3 zoom transform is ephemeral interaction state owned by the canvas renderer
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  // eslint-disable-next-line no-restricted-syntax -- hovered canvas node is transient pointer state used only for the lazy payload popover
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- clicked canvas node is transient local inspection state for pinning the lazy payload card
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(null);
  const selectedTopic =
    topics.find((topic) => topic.id === graphDataTopicId) ??
    topics.at(0) ??
    null;
  const selectedTopicId = selectedTopic?.id ?? '';
  const topicItems = topics.map((topic) => ({
    value: topic.id,
    label: topic.name,
  }));
  const selectedFilterNode = selectedGraphNodeId
    ? (index.nodeById.get(selectedGraphNodeId) ?? null)
    : null;
  // eslint-disable-next-line no-restricted-syntax -- scoped graph projection is expensive enough to keep stable across zoom-only redraws
  const scopedGraph = useMemo(() => {
    if (selectedFilterNode) {
      return buildDescendantScopedGraph({
        getDescendants,
        graph,
        selectedNodeId: selectedFilterNode.id,
      });
    }

    return buildTopicScopedGraph({
      getDescendants,
      graph,
      selectedTopic,
    });
  }, [getDescendants, graph, selectedFilterNode, selectedTopic]);
  // eslint-disable-next-line no-restricted-syntax -- data graph layout derives from the live graph and is reused across zoom-only redraws
  const typeLayout = useMemo(
    () =>
      buildTypeLevelGraphLayout(scopedGraph, viewport, {
        rootNodeType: selectedFilterNode?.nodeType,
      }),
    [scopedGraph, selectedFilterNode?.nodeType, viewport],
  );
  // eslint-disable-next-line no-restricted-syntax -- actual node packing is computed once per graph snapshot; zooming only interpolates the cached positions
  const graphDataLayout = useMemo(
    () => buildGraphDataLayout(scopedGraph, typeLayout),
    [scopedGraph, typeLayout],
  );
  // eslint-disable-next-line no-restricted-syntax -- D3 scale creation should stay stable while the graph node count range is unchanged
  const nodeRadiusScale = useMemo(() => {
    return scaleSqrt()
      .domain([0, Math.max(typeLayout.maxNodeCount, 1)])
      .range([DEFAULT_RADIUS, LARGE_RADIUS]);
  }, [typeLayout.maxNodeCount]);
  // eslint-disable-next-line no-restricted-syntax -- id lookup map is reused across the canvas edge pass for the same type-level layout
  const typeNodeById = useMemo(() => {
    return new Map(typeLayout.nodes.map((node) => [node.id, node]));
  }, [typeLayout.nodes]);
  // eslint-disable-next-line no-restricted-syntax -- fit transform derives from responsive canvas bounds and is reused by zoom binding and scene projection
  const fitTransform = useMemo(
    () =>
      getGraphDataFitTransform({
        height: graphDataLayout.height,
        viewport,
        width: graphDataLayout.width,
      }),
    [graphDataLayout.height, graphDataLayout.width, viewport],
  );
  const fitScale = fitTransform.k;
  // eslint-disable-next-line no-restricted-syntax -- scene derivation keeps the hot canvas draw path free from React node allocation
  const scene = useMemo(
    () =>
      buildGraphDataScene({
        fitScale,
        layout: graphDataLayout,
        transform,
        typeRadiusScale: nodeRadiusScale,
        viewport,
      }),
    [fitScale, graphDataLayout, nodeRadiusScale, transform, viewport],
  );
  const activeNodeId = pinnedNodeId ?? hoveredNodeId;
  const activeNode = activeNodeId
    ? scene.actualNodes.find((node) => node.id === activeNodeId)
    : null;

  // eslint-disable-next-line no-restricted-syntax -- D3 zoom binding is an imperative third-party DOM integration and must be attached after the canvas mounts
  useEffect(() => {
    if (!canvasRef.current || viewport.width === 0) {
      return;
    }

    const canvas = select(canvasRef.current);
    const nextZoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([fitScale * MIN_RELATIVE_ZOOM, fitScale * MAX_RELATIVE_ZOOM])
      .on('zoom', (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        setTransform(event.transform);
      });

    zoomBehaviorRef.current = nextZoomBehavior;
    canvas.call(nextZoomBehavior);
    canvas.call(nextZoomBehavior.transform, fitTransform);
    canvas.on('dblclick.zoom', null);

    return () => {
      canvas.on('.zoom', null);
    };
  }, [fitScale, fitTransform, viewport.width]);

  // eslint-disable-next-line no-restricted-syntax -- canvas drawing is the intentional imperative renderer for the high-volume graph data surface
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    drawGraphDataCanvas({
      canvas: canvasRef.current,
      fitScale,
      hoveredNodeId: activeNodeId,
      nodeById: typeNodeById,
      nodeRadiusScale,
      scene,
      transform,
      typeLayout,
      viewport,
    });
  }, [
    activeNodeId,
    fitScale,
    nodeRadiusScale,
    scene,
    transform,
    typeLayout,
    typeNodeById,
    viewport,
  ]);

  if (typeLayout.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-600">
          No graph data is loaded yet for the data graph view.
        </p>
      </div>
    );
  }

  const handleResetZoom = () => {
    if (!canvasRef.current || !zoomBehaviorRef.current) {
      return;
    }

    select(canvasRef.current).call(
      zoomBehaviorRef.current.transform,
      fitTransform,
    );
  };

  const getNodeFromPointerEvent = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return findNearestGraphDataNode({
      point: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      scene,
      transform,
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const nextHoveredNode = getNodeFromPointerEvent(event);

    setHoveredNodeId((currentHoveredNodeId) =>
      currentHoveredNodeId === nextHoveredNode?.id
        ? currentHoveredNodeId
        : (nextHoveredNode?.id ?? null),
    );
  };

  const handlePointerLeave = () => {
    setHoveredNodeId(null);
  };

  const navigateToGraphDataFilterNode = (nodeId: string) => {
    const selectedNode = nodeId ? (index.nodeById.get(nodeId) ?? null) : null;

    void navigate({
      search: (prev) => ({
        ...prev,
        selectedGraphNodeId: nodeId,
        selectedNodeId: nodeId,
        selectedNodeType: selectedNode?.nodeType ?? prev.selectedNodeType,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleCanvasClick = (event: PointerEvent<HTMLCanvasElement>) => {
    const nextPinnedNode = getNodeFromPointerEvent(event);
    setPinnedNodeId(nextPinnedNode?.id ?? null);

    if (nextPinnedNode) {
      navigateToGraphDataFilterNode(nextPinnedNode.id);
    }
  };

  const handleFilterNodeSelect = (node: { id: string }) => {
    setHoveredNodeId(null);
    setPinnedNodeId(null);
    navigateToGraphDataFilterNode(node.id);
  };

  const handleClearFilterNode = () => {
    setHoveredNodeId(null);
    setPinnedNodeId(null);
    navigateToGraphDataFilterNode('');
  };

  const handleTopicChange = (nextTopicId: string) => {
    if (nextTopicId === selectedTopicId) {
      return;
    }

    setHoveredNodeId(null);
    setPinnedNodeId(null);
    void navigate({
      search: (prev) => ({
        ...prev,
        graphDataTopicId: nextTopicId,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const hoverAnchor =
    activeNode && viewport.height > 0 && viewport.width > 0
      ? {
          x: transform.applyX(activeNode.displayX),
          y: transform.applyY(activeNode.displayY),
        }
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <GraphDataViewHeader
        activeTypeCount={scene.activeTypeCount}
        actualEdgeCount={graphDataLayout.actualEdges.length}
        actualNodeCount={graphDataLayout.actualNodes.length}
        filterNodeById={index.nodeById}
        filterNodeId={selectedGraphNodeId}
        focusedTypeLabel={scene.focusedTypeLabel}
        isDescendantFilterActive={Boolean(selectedFilterNode)}
        onClearFilterNode={handleClearFilterNode}
        onFilterNodeSelect={handleFilterNodeSelect}
        onResetZoom={handleResetZoom}
        onTopicChange={handleTopicChange}
        selectedTopicId={selectedTopicId}
        topicItems={topicItems}
      />
      <TypeLevelGraphViewLegend showSyntheticRoot={!selectedFilterNode} />

      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab rounded-lg border border-neutral-200 bg-neutral-50 active:cursor-grabbing"
          aria-label="Zoomable graph data view that expands type clusters into actual examination nodes"
          onClick={handleCanvasClick}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
        {activeNode && hoverAnchor && (
          <GraphDataNodePopover
            key={`${activeNode.nodeType}:${activeNode.id}`}
            anchor={hoverAnchor}
            nodeRef={{
              id: activeNode.id,
              nodeType: activeNode.nodeType,
            }}
            viewport={viewport}
          />
        )}
      </div>
    </div>
  );
}
