import { Toggle } from '@/features/ui/toggle/Toggle';
import { RotateCcw } from 'lucide-react';

type TypeLevelGraphViewHeaderProps = {
  animationsEnabled: boolean;
  edgeCount: number;
  onResetZoom: () => void;
  onToggleAnimations: () => void;
  realTypeCount: number;
};

function TypeGraphMetric(props: { label: string; value: string }) {
  return (
    <span className="flex h-9 min-w-20 flex-col justify-center rounded-md bg-slate-50 px-2.5 ring-1 ring-slate-200">
      <span className="text-[10px] leading-3 font-medium text-slate-500">
        {props.label}
      </span>
      <span className="truncate text-xs leading-4 font-semibold text-slate-900">
        {props.value}
      </span>
    </span>
  );
}

export function TypeLevelGraphViewHeader(props: TypeLevelGraphViewHeaderProps) {
  return (
    <div className="mb-3 w-full max-w-7xl self-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-sm leading-5 font-semibold text-slate-950">
            Schema graph
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] leading-4 font-semibold text-slate-700 ring-1 ring-slate-200">
            Type overview
          </span>
        </div>
        <p className="min-w-0 text-xs leading-5 text-slate-500">
          Double-click a node type to open it in the graph browser.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5">
        <TypeGraphMetric label="Types" value={String(props.realTypeCount)} />
        <TypeGraphMetric label="Links" value={String(props.edgeCount)} />
        <div className="rounded-lg bg-white pr-1 ring-1 ring-slate-200">
          <Toggle
            checked={props.animationsEnabled}
            label="Animations"
            onCheckedChange={props.onToggleAnimations}
          />
        </div>
        <button
          type="button"
          onClick={props.onResetZoom}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-blue-900 bg-white px-3 text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-50"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
    </div>
  );
}
