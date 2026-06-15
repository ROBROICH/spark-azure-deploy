import type { NodeSummary } from '@/db/nodes/types';
import { Input } from '@/features/ui/input/Input';
import { cn } from '@/features/ui/style/cn';
import { Search, X } from 'lucide-react';
import { useState } from 'react';

type NodeUuidSearchProps = {
  className?: string;
  compact?: boolean;
  helperText?: string;
  label: string;
  nodeById: Map<string, NodeSummary>;
  onClear: () => void;
  onSelectNode: (node: NodeSummary) => void;
  placeholder: string;
  selectedNodeId: string;
  showLabel?: boolean;
  showStatus?: boolean;
};

/**
 * Exact node UUID search that accepts any node type and resolves against the
 * current in-memory graph index.
 */
export function NodeUuidSearch(props: NodeUuidSearchProps) {
  const {
    className,
    compact = false,
    helperText,
    label,
    nodeById,
    onClear,
    onSelectNode,
    placeholder,
    selectedNodeId,
    showLabel = true,
    showStatus = true,
  } = props;
  // eslint-disable-next-line no-restricted-syntax -- local input text supports partial UUID entry before it resolves to a graph node.
  const [searchState, setSearchState] = useState({
    preserveDraftOnNextClear: false,
    selectedNodeId,
    value: selectedNodeId,
  });
  const nodeByNormalizedId = new Map(
    Array.from(nodeById.values()).map((node) => [
      node.id.toLocaleLowerCase(),
      node,
    ]),
  );

  if (searchState.selectedNodeId !== selectedNodeId) {
    const shouldPreserveDraft =
      selectedNodeId === '' && searchState.preserveDraftOnNextClear;
    setSearchState({
      preserveDraftOnNextClear: false,
      selectedNodeId,
      value: shouldPreserveDraft ? searchState.value : selectedNodeId,
    });
  }

  const searchValue = searchState.value;
  const trimmedValue = searchValue.trim();
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;
  const hasUnresolvedSearch =
    trimmedValue.length > 0 &&
    !selectedNode &&
    !nodeByNormalizedId.has(trimmedValue.toLocaleLowerCase());

  const handleChange = (value: string) => {
    const normalizedValue = value.trim().toLocaleLowerCase();
    const nextNode = nodeByNormalizedId.get(normalizedValue);

    setSearchState({
      preserveDraftOnNextClear: !nextNode && selectedNodeId.length > 0,
      selectedNodeId,
      value,
    });

    if (nextNode) {
      onSelectNode(nextNode);
      return;
    }

    if (selectedNodeId) {
      onClear();
    }
  };

  const handleClear = () => {
    setSearchState({
      preserveDraftOnNextClear: false,
      selectedNodeId,
      value: '',
    });
    onClear();
  };

  return (
    <div
      className={cn(
        'flex min-w-80 flex-col gap-1',
        compact && 'min-w-0',
        className,
      )}
    >
      {showLabel && (
        <span className="text-xs leading-4 font-medium text-slate-600">
          {label}
        </span>
      )}
      <div className="relative">
        <Search
          aria-hidden
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
        />
        <Input
          type="text"
          value={searchValue}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            'rounded-lg border-slate-300 bg-white pr-9 pl-9 font-mono text-xs shadow-none',
            compact ? 'h-9' : 'h-10',
          )}
        />
        {searchValue.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Clear node UUID search"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {showStatus &&
        (selectedNode ? (
          <span className="h-4 truncate text-xs leading-4 text-slate-500">
            Selected {selectedNode.node_type} node.
          </span>
        ) : hasUnresolvedSearch ? (
          <span className="h-4 truncate text-xs leading-4 text-red-600">
            No node matches this UUID.
          </span>
        ) : helperText ? (
          <span className="h-4 truncate text-xs leading-4 text-slate-500">
            {helperText}
          </span>
        ) : null)}
    </div>
  );
}
