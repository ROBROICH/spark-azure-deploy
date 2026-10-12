import type { NodeSummary } from '@/db/nodes/types';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { RotateCcw } from 'lucide-react';
import { NodeUuidSearch } from './NodeUuidSearch';

export type GraphDataViewHeaderTopicItem = {
  label: string;
  value: string;
};

function GraphDataMetric(props: { label: string; value: string }) {
  return (
    <span className="flex h-9 min-w-17 flex-col justify-center rounded-md bg-slate-50 px-2.5 ring-1 ring-slate-200">
      <span className="text-[10px] leading-3 font-medium text-slate-500">
        {props.label}
      </span>
      <span className="truncate text-xs leading-4 font-semibold text-slate-900">
        {props.value}
      </span>
    </span>
  );
}

export function GraphDataViewHeader(props: {
  activeTypeCount: number;
  actualEdgeCount: number;
  actualNodeCount: number;
  filterNodeById: Map<string, NodeSummary>;
  filterNodeId: string;
  focusedTypeLabel: string | null;
  isDescendantFilterActive: boolean;
  onClearFilterNode: () => void;
  onFilterNodeSelect: (node: NodeSummary) => void;
  onResetZoom: () => void;
  onTopicChange: (topicId: string) => void;
  selectedTopicId: string;
  topicItems: GraphDataViewHeaderTopicItem[];
}) {
  const focusedLabel = props.focusedTypeLabel ?? 'No focused type';
  const selectedNode = props.filterNodeId
    ? (props.filterNodeById.get(props.filterNodeId) ?? null)
    : null;

  return (
    <div className="mb-3 w-full max-w-7xl self-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm leading-5 font-semibold text-slate-950">
            Data graph
          </h2>
          {props.isDescendantFilterActive && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] leading-4 font-semibold text-blue-800 ring-1 ring-blue-200">
              Descendant filter
            </span>
          )}
          {selectedNode && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] leading-4 font-semibold text-emerald-800 ring-1 ring-emerald-200">
              {selectedNode.nodeType}
            </span>
          )}
        </div>
        <p className="min-w-0 text-xs leading-5 text-slate-500">
          Focus:{' '}
          <span className="inline-block w-56 truncate align-bottom font-medium text-slate-700">
            {focusedLabel}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <NodeUuidSearch
          compact
          className="min-w-80 flex-1 basis-[28rem]"
          helperText="Any node type"
          label="Filter by node UUID"
          nodeById={props.filterNodeById}
          onClear={props.onClearFilterNode}
          onSelectNode={props.onFilterNodeSelect}
          placeholder="Filter by node UUID"
          selectedNodeId={props.filterNodeId}
          showLabel={false}
          showStatus={false}
        />
        <SelectMenu
          items={props.topicItems}
          value={props.selectedTopicId}
          onChange={props.onTopicChange}
          placeholder="Select topic"
          ariaLabel="Select graph data topic"
          align="end"
          triggerClassName="h-9 w-52 justify-between overflow-hidden rounded-lg"
          className="max-h-80 overflow-y-auto"
        />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <GraphDataMetric
            label="Nodes"
            value={String(props.actualNodeCount)}
          />
          <GraphDataMetric
            label="Edges"
            value={String(props.actualEdgeCount)}
          />
          <GraphDataMetric
            label="Expanded"
            value={String(props.activeTypeCount)}
          />
          <button
            type="button"
            onClick={props.onResetZoom}
            className="ml-1 flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-blue-900 bg-white px-3 text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-50"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
