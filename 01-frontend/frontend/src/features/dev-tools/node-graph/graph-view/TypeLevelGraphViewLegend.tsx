export function TypeLevelGraphViewLegend(props: {
  showSyntheticRoot?: boolean;
}) {
  const { showSyntheticRoot = true } = props;

  return (
    <div className="mb-3 flex min-h-6 flex-wrap items-center gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-2">
        <span className="relative block w-6">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-400" />
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-slate-600" />
        </span>
        Forward flow
      </span>
      <span className="flex items-center gap-2">
        <span className="relative block w-6">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-300" />
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dotted border-slate-500" />
        </span>
        Cross/back flow
      </span>
      {showSyntheticRoot && (
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-slate-500" />
          Synthetic project root
        </span>
      )}
    </div>
  );
}
