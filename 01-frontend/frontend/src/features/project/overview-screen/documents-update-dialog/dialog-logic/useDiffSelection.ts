import type { FileDiffResponse } from '@/api-clients/dms-module';
import { useState } from 'react';
import {
  buildDefaultSelectedKeys,
  buildDiffRows,
  buildDiffTree,
  collectAllFolderPaths,
  type DiffRow,
  type DiffTreeNode,
} from '../documentDiff.utils';

export type DiffSelection = {
  rows: DiffRow[];
  tree: DiffTreeNode[];
  selectedKeys: Set<string>;
  expandedPaths: Set<string>;
  selectableTotal: number;
  selectedCount: number;
  toggleKey: (key: string) => void;
  toggleAll: () => void;
  toggleFolder: (path: string) => void;
};

/**
 * Owns ephemeral diff-step UI state: per-row selection, folder expansion, and
 * the derived counts that drive the footer. Selection defaults to "all
 * selectable rows" and expansion defaults to every folder so the user sees
 * the full diff without having to drill in.
 *
 * @param diff Diff response from the backend or `null` while loading.
 * @returns Derived rows/tree plus selection and expansion state and toggles.
 */
export const useDiffSelection = (
  diff: FileDiffResponse | null,
): DiffSelection => {
  const rows = diff ? buildDiffRows(diff) : [];
  const tree = buildDiffTree(rows);
  const defaultExpandedPaths = collectAllFolderPaths(tree);

  const [selectionOverride, setSelectionOverride] =
    // eslint-disable-next-line no-restricted-syntax -- diff-step row selection is ephemeral UI state local to this step.
    useState<Set<string> | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- folder expansion is ephemeral UI state for the dialog step and intentionally does not persist past close.
  const [expandedOverride, setExpandedOverride] = useState<Set<string> | null>(
    null,
  );

  const selectedKeys =
    selectionOverride ??
    (diff ? buildDefaultSelectedKeys(rows) : new Set<string>());

  const expandedPaths = expandedOverride ?? defaultExpandedPaths;

  const selectableTotal = rows.filter((row) => row.selectable).length;
  const selectedCount = rows.filter(
    (row) => row.selectable && selectedKeys.has(row.key),
  ).length;

  const toggleKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectionOverride(next);
  };

  const toggleAll = () => {
    if (selectedCount === selectableTotal) {
      setSelectionOverride(new Set());
      return;
    }
    setSelectionOverride(buildDefaultSelectedKeys(rows));
  };

  const toggleFolder = (path: string) => {
    const next = new Set(expandedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedOverride(next);
  };

  return {
    rows,
    tree,
    selectedKeys,
    expandedPaths,
    selectableTotal,
    selectedCount,
    toggleKey,
    toggleAll,
    toggleFolder,
  };
};
