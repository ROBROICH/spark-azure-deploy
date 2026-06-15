import type { TypeLevelGraphEdge } from './typeLevelGraph.logic';
import { getEdgeStrokeWidth } from './typeLevelGraphView.logic';

export const EDGE_MARKER_SIZE = 5;
const EDGE_SELECTED = '#155e75';
const EDGE_SELECTED_FLOW = '#7dd3dc';
const EDGE_THIN_BASE = '#d9dee4';
const EDGE_THIN_FLOW = '#5b6572';
const EDGE_THICK_BASE = '#6b7280';
const EDGE_THICK_FLOW = '#f3f4f6';

export type EdgePresentation = {
  baseOpacity: number;
  baseStroke: string;
  baseStrokeWidth: number;
  flowDasharray: string;
  flowDurationSeconds: number;
  flowOpacity: number;
  flowStroke: string;
  flowStrokeWidth: number;
  glowOpacity: number;
  glowStroke: string;
  glowStrokeWidth: number;
  markerEnd: string;
};

/**
 * Maps each edge into a layered visual treatment for the SVG graph so base
 * links stay quiet while hovered-connected links get a stronger petrol body,
 * a soft halo, and a faster pipeline carrier animation.
 */
export function getEdgePresentation(
  edge: TypeLevelGraphEdge,
  isConnectedToHoveredNode: boolean,
): EdgePresentation {
  const baseStrokeWidth = getEdgeStrokeWidth(edge.count);
  const isThickEdge = edge.count >= 12;

  if (isConnectedToHoveredNode) {
    return {
      baseOpacity: 0.96,
      baseStroke: EDGE_SELECTED,
      baseStrokeWidth: baseStrokeWidth + 0.7,
      flowDasharray: '3 12',
      flowDurationSeconds: Math.max(1.15, 2.25 - edge.count * 0.03),
      flowOpacity: 0.95,
      flowStroke: EDGE_SELECTED_FLOW,
      flowStrokeWidth: baseStrokeWidth + 0.9,
      glowOpacity: 0.24,
      glowStroke: EDGE_SELECTED,
      glowStrokeWidth: baseStrokeWidth + 4.6,
      markerEnd: 'url(#type-graph-arrow-highlight)',
    };
  }

  return {
    baseOpacity: edge.kind === 'forward' ? 0.72 : 0.56,
    baseStroke: isThickEdge ? EDGE_THICK_BASE : EDGE_THIN_BASE,
    baseStrokeWidth,
    flowDasharray: isThickEdge
      ? edge.kind === 'forward'
        ? '4 12'
        : '4 14'
      : edge.kind === 'forward'
        ? '2 14'
        : '2 16',
    flowDurationSeconds: Math.max(1.5, 2.85 - edge.count * 0.028),
    flowOpacity: edge.kind === 'forward' ? 0.92 : 0.78,
    flowStroke: isThickEdge ? EDGE_THICK_FLOW : EDGE_THIN_FLOW,
    flowStrokeWidth: Math.max(
      edge.kind === 'forward' ? 1.55 : 1.35,
      baseStrokeWidth + (edge.kind === 'forward' ? 0.65 : 0.4),
    ),
    glowOpacity: 0,
    glowStroke: 'transparent',
    glowStrokeWidth: baseStrokeWidth,
    markerEnd: 'url(#type-graph-arrow)',
  };
}
