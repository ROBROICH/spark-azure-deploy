import { Badge } from '@/features/ui/badge/Badge';
import type { NodeTypeLiteral } from '@/db/nodes/types';
import { getNodeTypeColor } from '../nodeTypePresentation';

type StatisticsPanelProps = {
  estimatedGraphMemoryMb: number;
  loadedPayloadCount: number;
  loadedPayloadPercent: number;
  nodeCountsByType: Map<NodeTypeLiteral, number>;
  totalNodes: number;
};

export function StatisticsPanel(props: StatisticsPanelProps) {
  const {
    estimatedGraphMemoryMb,
    loadedPayloadCount,
    loadedPayloadPercent,
    nodeCountsByType,
    totalNodes,
  } = props;

  const sortedEntries = Array.from(nodeCountsByType.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Node Statistics</span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalNodes} total</Badge>
          <Badge variant="secondary">
            {estimatedGraphMemoryMb.toFixed(2)} MB
          </Badge>
          <Badge variant="secondary">
            {loadedPayloadCount} payloads ({loadedPayloadPercent.toFixed(1)}%)
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
        {sortedEntries.map(([type, count]) => (
          <div key={type} className="flex items-center gap-2 py-0.5">
            <div
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: getNodeTypeColor(type) }}
            />
            <span className="truncate text-xs text-neutral-600">{type}</span>
            <span className="ml-auto text-xs font-medium tabular-nums">
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
