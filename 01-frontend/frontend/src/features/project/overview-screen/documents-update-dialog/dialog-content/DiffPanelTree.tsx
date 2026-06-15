import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getBasename,
  type DiffRow,
  type DiffTreeNode,
} from '../documentDiff.utils';
import { DiffFileRow } from './DiffFileRow';
import { DiffFolderRow } from './DiffFolderRow';
import type { ChangeType } from './DocumentChangeBadge';

const FILE_DEPTH_INDENT_PX = 16;
// Files sit one level inside their parent folder's name column, past the
// chevron toggle (which occupies a `size-6` slot in the folder row).
const FILE_BASE_INDENT_PX = 24;

type DiffFileRowInput = {
  filename: string | null;
  changeType: ChangeType;
};

const resolveOldRow = (row: DiffRow): DiffFileRowInput => {
  if (row.changeType === 'new') {
    return { filename: null, changeType: 'new' };
  }

  return {
    filename: row.oldFilename === null ? null : getBasename(row.oldFilename),
    changeType: row.changeType,
  };
};

const resolveNewRow = (row: DiffRow): DiffFileRowInput => {
  if (row.changeType === 'deleted') {
    return { filename: null, changeType: 'deleted' };
  }

  return {
    filename: getBasename(row.newFilename),
    changeType: row.changeType,
  };
};

type DiffPanelTreeBaseProps = {
  tree: DiffTreeNode[];
  expandedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
};

type DiffPanelTreeProps =
  | (DiffPanelTreeBaseProps & { variant: 'old' })
  | (DiffPanelTreeBaseProps & {
      variant: 'new';
      selection: {
        selectedKeys: Set<string>;
        onToggleKey: (key: string) => void;
      };
    });

/**
 * Recursive renderer for one side of the document diff tree. Folder nodes
 * expand/collapse, file leaves render a row with an optional selection
 * checkbox on the new-side variant.
 *
 * @param props Variant, tree data, expand/select state, and toggle callbacks.
 * @returns The recursive list of folder and file rows.
 */
export const DiffPanelTree = (props: DiffPanelTreeProps) => {
  const { variant, tree, expandedPaths, onToggleFolder } = props;
  const selection = props.variant === 'new' ? props.selection : null;
  const { t } = useTranslation('Project');

  const resolveRow = variant === 'old' ? resolveOldRow : resolveNewRow;

  const renderNode = (node: DiffTreeNode, depth: number): ReactNode => {
    if (node.kind === 'folder') {
      const isExpanded = expandedPaths.has(node.path);

      return (
        <Fragment key={`folder:${node.path}`}>
          <DiffFolderRow
            name={node.name}
            documentCount={node.documentCount}
            depth={depth}
            isExpanded={isExpanded}
            onToggle={() => onToggleFolder(node.path)}
          />
          {isExpanded &&
            node.children.map((child) => renderNode(child, depth + 1))}
        </Fragment>
      );
    }

    const row = node.row;
    const resolved = resolveRow(row);
    const showCheckbox = selection !== null && row.selectable;
    const rowSelection = showCheckbox
      ? {
          checked: selection.selectedKeys.has(row.key),
          onToggle: () => selection.onToggleKey(row.key),
          ariaLabel: t('Documents.updateDocuments.diff.selectionAria', {
            filename: row.newFilename,
          }),
        }
      : undefined;

    return (
      <div
        key={`${variant}-${row.key}`}
        style={{
          paddingLeft: FILE_BASE_INDENT_PX + depth * FILE_DEPTH_INDENT_PX,
        }}
      >
        <DiffFileRow
          filename={resolved.filename}
          changeType={resolved.changeType}
          showBadge={variant === 'new'}
          selection={rowSelection}
        />
      </div>
    );
  };

  return <>{tree.map((node) => renderNode(node, 0))}</>;
};
