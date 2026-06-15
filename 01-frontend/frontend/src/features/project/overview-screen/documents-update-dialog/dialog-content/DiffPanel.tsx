import { cn } from '@/features/ui/style/cn';
import { type RefObject } from 'react';
import { type DiffTreeNode } from '../documentDiff.utils';
import { DiffPanelHeader } from './DiffPanelHeader';
import { DiffPanelTree } from './DiffPanelTree';

type DiffPanelBaseProps = {
  tree: DiffTreeNode[];
  expandedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
};

type DiffPanelProps =
  | (DiffPanelBaseProps & { variant: 'old' })
  | (DiffPanelBaseProps & {
      variant: 'new';
      selectedKeys: Set<string>;
      selectableTotal: number;
      selectedTotal: number;
      onToggleKey: (key: string) => void;
      onToggleAll: () => void;
    });

const resolveCheckedState = (
  selectableTotal: number,
  selectedTotal: number,
): boolean | 'mixed' => {
  if (selectableTotal > 0 && selectedTotal === selectableTotal) {
    return true;
  }
  if (selectedTotal > 0) {
    return 'mixed';
  }
  return false;
};

/**
 * Composes one side of the document diff: header toolbar plus the recursive
 * folder/file tree. The new-side variant additionally exposes the toggle-all
 * affordance and per-row selection checkboxes.
 *
 * @param props Variant flag and the data required by the header and tree.
 * @returns The diff panel for either the previous or the new document set.
 */
export const DiffPanel = (props: DiffPanelProps) => {
  const { variant, tree, expandedPaths, onToggleFolder, scrollRef } = props;

  const containerBg = variant === 'old' ? 'bg-slate-50' : 'bg-white';

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', containerBg)}>
      {props.variant === 'new' ? (
        <DiffPanelHeader
          variant="new"
          selectableTotal={props.selectableTotal}
          checkedState={resolveCheckedState(
            props.selectableTotal,
            props.selectedTotal,
          )}
          onToggleAll={props.onToggleAll}
        />
      ) : (
        <DiffPanelHeader variant="old" />
      )}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-1 py-2"
      >
        {props.variant === 'new' ? (
          <DiffPanelTree
            variant="new"
            tree={tree}
            expandedPaths={expandedPaths}
            onToggleFolder={onToggleFolder}
            selection={{
              selectedKeys: props.selectedKeys,
              onToggleKey: props.onToggleKey,
            }}
          />
        ) : (
          <DiffPanelTree
            variant="old"
            tree={tree}
            expandedPaths={expandedPaths}
            onToggleFolder={onToggleFolder}
          />
        )}
      </div>
    </div>
  );
};
