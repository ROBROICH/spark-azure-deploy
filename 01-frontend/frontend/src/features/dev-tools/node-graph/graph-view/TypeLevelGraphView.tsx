import { getRouteApi } from '@tanstack/react-router';
import {
  type D3ZoomEvent,
  scaleSqrt,
  select,
  zoom,
  zoomIdentity,
  type ZoomBehavior,
} from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import {
  buildTypeLevelGraphLayout,
  GRAPH_ROOT_NODE_ID,
  type TypeLevelGraphNode,
} from './typeLevelGraph.logic';
import {
  buildVisibleNodeLabels,
  createTypeGraphSimulation,
} from './typeLevelGraphView.logic';
import { TypeLevelGraphViewHeader } from './TypeLevelGraphViewHeader';
import { TypeLevelGraphViewLegend } from './TypeLevelGraphViewLegend';
import { TypeLevelGraphViewSvg } from './TypeLevelGraphViewSvg';
import { useGraphViewport } from './useCanvasViewport';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import type { useNodeGraph } from '../graph-data/useNodeGraph';

const route = getRouteApi('/verfahren/$verfahrenId/examination-dev');
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 3.5;
const DEFAULT_RADIUS = 18;
const LARGE_RADIUS = 32;
const animationsEnabledStorageSchema = z.boolean();

type TypeLevelGraphViewProps = {
  graphResult: ReturnType<typeof useNodeGraph>;
};

/**
 * Renders the type-level graph surface with a zoomable SVG while the force
 * layout and label visibility are handled by feature-local helpers.
 */
export function TypeLevelGraphView(props: TypeLevelGraphViewProps) {
  const navigate = route.useNavigate();
  const { graph } = props.graphResult;
  const { containerRef, viewport } = useGraphViewport();
  const [animationsEnabled, setAnimationsEnabled] = useLocalStorage({
    initialValue: true,
    key: 'node-graph-type-level-animations-enabled',
    schema: animationsEnabledStorageSchema,
  });
  // eslint-disable-next-line no-restricted-syntax -- the type-level layout derives from the live graph and is expensive enough to keep stable across zoom-only renders
  const graphModel = useMemo(
    () => buildTypeLevelGraphLayout(graph, viewport),
    [graph, viewport],
  );
  const realTypeCount = graphModel.nodes.filter(
    (node) => node.id !== GRAPH_ROOT_NODE_ID,
  ).length;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(
    null,
  );
  // eslint-disable-next-line no-restricted-syntax -- zoom transform is ephemeral local SVG interaction state and should not be persisted to the URL
  const [zoomTransform, setZoomTransform] = useState(zoomIdentity);
  // eslint-disable-next-line no-restricted-syntax -- hovered node highlighting is transient SVG interaction state and should not be persisted to route search
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- D3 scale creation should stay stable while the graph node count range is unchanged
  const nodeRadiusScale = useMemo(() => {
    return scaleSqrt()
      .domain([0, Math.max(graphModel.maxNodeCount, 1)])
      .range([DEFAULT_RADIUS, LARGE_RADIUS]);
  }, [graphModel.maxNodeCount]);
  // eslint-disable-next-line no-restricted-syntax -- the force simulation continuously updates the rendered node positions as local SVG interaction state
  const [animatedNodeState, setAnimatedNodeState] = useState(() => ({
    nodes: graphModel.nodes,
    sourceNodes: graphModel.nodes,
  }));
  let renderNodes = animationsEnabled
    ? animatedNodeState.nodes
    : graphModel.nodes;
  if (animatedNodeState.sourceNodes !== graphModel.nodes) {
    renderNodes = graphModel.nodes;
    setAnimatedNodeState({
      nodes: graphModel.nodes,
      sourceNodes: graphModel.nodes,
    });
  }
  // eslint-disable-next-line no-restricted-syntax -- the id lookup map is reused across the SVG edge and node render passes for the same graph snapshot
  const nodeById = useMemo(() => {
    return new Map(renderNodes.map((node) => [node.id, node]));
  }, [renderNodes]);
  // eslint-disable-next-line no-restricted-syntax -- label placement depends on animated node positions and is reused by every SVG label render in the same frame
  const visibleLabels = useMemo(() => {
    return buildVisibleNodeLabels(renderNodes, nodeRadiusScale, zoomTransform);
  }, [nodeRadiusScale, renderNodes, zoomTransform]);

  // eslint-disable-next-line no-restricted-syntax -- D3 zoom binding is an imperative third-party DOM integration and must be attached after the SVG mounts
  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = select(svgRef.current);
    const nextZoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setZoomTransform(event.transform);
      });

    zoomBehaviorRef.current = nextZoomBehavior;
    svg.call(nextZoomBehavior);
    svg.call(nextZoomBehavior.transform, zoomIdentity);
    svg.on('dblclick.zoom', null);

    return () => {
      svg.on('.zoom', null);
    };
  }, [graphModel.height, graphModel.width]);

  // eslint-disable-next-line no-restricted-syntax -- D3 force simulation is an imperative animation/integration layer for this graph view and must run outside render
  useEffect(() => {
    if (!animationsEnabled || graphModel.nodes.length === 0) {
      return;
    }

    const simulation = createTypeGraphSimulation({
      edges: graphModel.edges,
      nodeRadiusScale,
      nodes: graphModel.nodes,
      setRenderNodes: (nodes) => {
        setAnimatedNodeState({
          nodes,
          sourceNodes: graphModel.nodes,
        });
      },
    });

    return simulation.cleanup;
  }, [animationsEnabled, graphModel.edges, graphModel.nodes, nodeRadiusScale]);

  if (graphModel.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-600">
          No graph data is loaded yet for the type-level view.
        </p>
      </div>
    );
  }

  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) {
      return;
    }

    select(svgRef.current).call(
      zoomBehaviorRef.current.transform,
      zoomIdentity,
    );
  };

  const handleNodeDoubleClick = (node: TypeLevelGraphNode) => {
    const selectedNodeType = node.nodeType;

    if (!selectedNodeType) {
      return;
    }

    navigate({
      search: (prev) => ({
        ...prev,
        selectedNodeId: '',
        selectedNodeType,
        view: 'graph',
      }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <TypeLevelGraphViewHeader
        animationsEnabled={animationsEnabled}
        edgeCount={graphModel.edges.length}
        realTypeCount={realTypeCount}
        onResetZoom={handleResetZoom}
        onToggleAnimations={() =>
          setAnimationsEnabled((currentValue: boolean) => !currentValue)
        }
      />
      <TypeLevelGraphViewLegend />
      <div ref={containerRef} className="min-h-0 flex-1">
        <TypeLevelGraphViewSvg
          animationsEnabled={animationsEnabled}
          graphModel={graphModel}
          hoveredNodeId={hoveredNodeId}
          nodeById={nodeById}
          nodeRadiusScale={nodeRadiusScale}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeHover={setHoveredNodeId}
          onNodeHoverLeave={(nodeId) =>
            setHoveredNodeId((currentValue) =>
              currentValue === nodeId ? null : currentValue,
            )
          }
          renderNodes={renderNodes}
          svgRef={svgRef}
          visibleLabels={visibleLabels}
          zoomTransform={zoomTransform}
        />
      </div>
    </div>
  );
}
