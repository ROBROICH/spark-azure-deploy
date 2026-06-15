import type { ZoomTransform } from 'd3';
import type { RefObject } from 'react';
import {
  EDGE_MARKER_SIZE,
  getEdgePresentation,
} from './typeLevelGraphEdgeStyles';
import {
  GRAPH_ROOT_NODE_ID,
  type TypeLevelGraphLayout,
  type TypeLevelGraphNode,
} from './typeLevelGraph.logic';
import type { VisibleNodeLabel } from './typeLevelGraphView.logic';

const BACK_EDGE_PULL = 56;
const EDGE_HIGHLIGHT_PETROL = '#155e75';

type TypeLevelGraphViewSvgProps = {
  animationsEnabled: boolean;
  graphModel: TypeLevelGraphLayout;
  hoveredNodeId: string | null;
  nodeById: Map<string, TypeLevelGraphNode>;
  nodeRadiusScale: (count: number) => number;
  onNodeDoubleClick: (node: TypeLevelGraphNode) => void;
  onNodeHover: (nodeId: string) => void;
  onNodeHoverLeave: (nodeId: string) => void;
  renderNodes: TypeLevelGraphNode[];
  svgRef: RefObject<SVGSVGElement | null>;
  visibleLabels: Map<string, VisibleNodeLabel>;
  zoomTransform: ZoomTransform;
};

type TypeLevelGraphLayerProps = Omit<TypeLevelGraphViewSvgProps, 'svgRef'>;

function createForwardPath(
  sourcePoint: { x: number; y: number },
  targetPoint: { x: number; y: number },
) {
  const controlY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2;
  const horizontalPull = (targetPoint.x - sourcePoint.x) * 0.18;

  return `M ${sourcePoint.x} ${sourcePoint.y} C ${sourcePoint.x + horizontalPull} ${controlY}, ${targetPoint.x - horizontalPull} ${controlY}, ${targetPoint.x} ${targetPoint.y}`;
}

function TypeLevelGraphViewMarkers() {
  return (
    <defs>
      <marker
        id="type-graph-arrow"
        markerWidth={EDGE_MARKER_SIZE}
        markerHeight={EDGE_MARKER_SIZE}
        refX={EDGE_MARKER_SIZE}
        refY={EDGE_MARKER_SIZE / 2}
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <path
          d={`M0,0 L${EDGE_MARKER_SIZE},${EDGE_MARKER_SIZE / 2} L0,${EDGE_MARKER_SIZE} z`}
          fill="#6b7280"
        />
      </marker>
      <marker
        id="type-graph-arrow-highlight"
        markerWidth={EDGE_MARKER_SIZE}
        markerHeight={EDGE_MARKER_SIZE}
        refX={EDGE_MARKER_SIZE}
        refY={EDGE_MARKER_SIZE / 2}
        orient="auto"
        markerUnits="userSpaceOnUse"
      >
        <path
          d={`M0,0 L${EDGE_MARKER_SIZE},${EDGE_MARKER_SIZE / 2} L0,${EDGE_MARKER_SIZE} z`}
          fill={EDGE_HIGHLIGHT_PETROL}
        />
      </marker>
    </defs>
  );
}

function TypeLevelGraphEdgeLayer(props: TypeLevelGraphLayerProps) {
  return (
    <>
      {props.graphModel.edges.map((edge) => {
        const sourceNode = props.nodeById.get(edge.source);
        const targetNode = props.nodeById.get(edge.target);

        if (!sourceNode || !targetNode) {
          return null;
        }

        const sourceRadius = props.nodeRadiusScale(sourceNode.count);
        const targetRadius = props.nodeRadiusScale(targetNode.count);
        const sourcePoint = {
          x: sourceNode.x,
          y: sourceNode.y + sourceRadius,
        };
        const targetPoint = {
          x: targetNode.x,
          y: targetNode.y - targetRadius,
        };
        const pathData = edge.isBackEdge
          ? `M ${sourcePoint.x} ${sourcePoint.y} C ${sourcePoint.x + BACK_EDGE_PULL} ${sourcePoint.y + 18}, ${targetPoint.x + BACK_EDGE_PULL} ${targetPoint.y - 18}, ${targetPoint.x} ${targetPoint.y}`
          : createForwardPath(sourcePoint, targetPoint);
        const isConnectedToHoveredNode =
          props.hoveredNodeId !== null &&
          (edge.source === props.hoveredNodeId ||
            edge.target === props.hoveredNodeId);
        const presentation = getEdgePresentation(
          edge,
          isConnectedToHoveredNode,
        );

        return (
          <g key={`${edge.source}-${edge.target}`}>
            {presentation.glowOpacity > 0 && (
              <path
                d={pathData}
                fill="none"
                stroke={presentation.glowStroke}
                strokeLinecap="round"
                strokeWidth={presentation.glowStrokeWidth}
                opacity={presentation.glowOpacity}
                pointerEvents="none"
              />
            )}
            <path
              d={pathData}
              fill="none"
              stroke={presentation.baseStroke}
              strokeLinecap="round"
              strokeWidth={presentation.baseStrokeWidth}
              markerEnd={presentation.markerEnd}
              opacity={presentation.baseOpacity}
            />
            <path
              d={pathData}
              fill="none"
              stroke={presentation.flowStroke}
              strokeDasharray={presentation.flowDasharray}
              strokeLinecap="round"
              strokeWidth={presentation.flowStrokeWidth}
              opacity={presentation.flowOpacity}
              pointerEvents="none"
            >
              {props.animationsEnabled && (
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-32"
                  dur={`${presentation.flowDurationSeconds}s`}
                  repeatCount="indefinite"
                />
              )}
            </path>
            <title>
              {sourceNode.label} → {targetNode.label} ({edge.count})
            </title>
          </g>
        );
      })}
    </>
  );
}

function TypeLevelGraphNodeLayer(props: TypeLevelGraphLayerProps) {
  return (
    <>
      {props.renderNodes.map((node) => {
        const radius = props.nodeRadiusScale(node.count);
        const label = props.visibleLabels.get(node.id);

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onDoubleClick={() => props.onNodeDoubleClick(node)}
            onMouseEnter={() => props.onNodeHover(node.id)}
            onMouseLeave={() => props.onNodeHoverLeave(node.id)}
            className={
              node.id === GRAPH_ROOT_NODE_ID ? undefined : 'cursor-pointer'
            }
          >
            <circle
              r={radius}
              fill={node.color}
              stroke="white"
              strokeWidth={3}
            />
            <circle
              r={radius + 6}
              fill="none"
              stroke={node.color}
              strokeOpacity={0.18}
              strokeWidth={2}
            />
            <text
              y={4}
              textAnchor="middle"
              fill="white"
              fontSize={Math.max(11, radius / 2)}
              fontWeight={700}
            >
              {node.count}
            </text>

            {label && (
              <>
                <text
                  x={label.textX}
                  y={label.textY}
                  textAnchor={label.anchor}
                  fill="#0f172a"
                  fontSize={14}
                  fontWeight={700}
                >
                  {node.label}
                </text>
                <text
                  x={label.textX}
                  y={label.metaY}
                  textAnchor={label.anchor}
                  fill="#64748b"
                  fontSize={11}
                >
                  {node.degree} edges
                </text>
              </>
            )}

            <title>
              {node.label}: {node.count} nodes, {node.degree} edges
            </title>
          </g>
        );
      })}
    </>
  );
}

export function TypeLevelGraphViewSvg(props: TypeLevelGraphViewSvgProps) {
  const {
    animationsEnabled,
    graphModel,
    hoveredNodeId,
    nodeById,
    nodeRadiusScale,
    onNodeDoubleClick,
    onNodeHover,
    onNodeHoverLeave,
    renderNodes,
    svgRef,
    visibleLabels,
    zoomTransform,
  } = props;
  const layerProps = {
    animationsEnabled,
    graphModel,
    hoveredNodeId,
    nodeById,
    nodeRadiusScale,
    onNodeDoubleClick,
    onNodeHover,
    onNodeHoverLeave,
    renderNodes,
    visibleLabels,
    zoomTransform,
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${graphModel.width} ${graphModel.height}`}
      className="h-full min-h-0 w-full rounded-lg border border-neutral-200 bg-neutral-50"
      role="img"
      aria-label="Type-level examination graph"
    >
      <TypeLevelGraphViewMarkers />

      <g
        transform={`translate(${zoomTransform.x}, ${zoomTransform.y}) scale(${zoomTransform.k})`}
      >
        <TypeLevelGraphEdgeLayer {...layerProps} />
        <TypeLevelGraphNodeLayer {...layerProps} />
      </g>
    </svg>
  );
}
