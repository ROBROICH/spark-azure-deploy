import type { FileDiffResponse } from '@/api-clients/backend';
import type { ChangeType } from './dialog-content/DocumentChangeBadge';

type NewFile = FileDiffResponse['new'][number];
type DeleteChange = FileDiffResponse['deleted'][number];
type FileChange = FileDiffResponse['changed'][number];
type RenameChange = FileDiffResponse['renamed'][number];
type Unchanged = FileDiffResponse['unchanged'][number];

export type DiffRow = {
  key: string;
  oldFilename: string | null;
  newFilename: string;
  changeType: ChangeType;
  selectable: boolean;
};

export type DiffTreeFile = {
  kind: 'file';
  row: DiffRow;
};

export type DiffTreeFolder = {
  kind: 'folder';
  path: string;
  name: string;
  documentCount: number;
  children: DiffTreeNode[];
};

export type DiffTreeNode = DiffTreeFile | DiffTreeFolder;

/**
 * Returns the trailing path segment of a filename that may include `/` separators.
 *
 * @param path Possibly-nested filename from the diff response.
 * @returns The leaf segment (basename) of the path.
 */
export const getBasename = (path: string): string => {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.length === 0 ? path : (segments[segments.length - 1] ?? path);
};

const ensureChildFolder = (
  parent: DiffTreeFolder,
  name: string,
  path: string,
): DiffTreeFolder => {
  const existing = parent.children.find(
    (child): child is DiffTreeFolder =>
      child.kind === 'folder' && child.name === name,
  );

  if (existing) {
    return existing;
  }

  const created: DiffTreeFolder = {
    kind: 'folder',
    path,
    name,
    documentCount: 0,
    children: [],
  };
  parent.children.push(created);
  return created;
};

const compareSiblings = (a: DiffTreeNode, b: DiffTreeNode): number => {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  const aName = a.kind === 'folder' ? a.name : getBasename(a.row.newFilename);
  const bName = b.kind === 'folder' ? b.name : getBasename(b.row.newFilename);
  return aName.localeCompare(bName);
};

/**
 * Recursively assigns `documentCount` to every folder and sorts each
 * level (folders before files, then alphabetical).
 *
 * @param folder Folder whose subtree should be finalized in place.
 * @returns Total number of file leaves under `folder`.
 */
const finalizeFolder = (folder: DiffTreeFolder): number => {
  let count = 0;

  for (const child of folder.children) {
    count += child.kind === 'file' ? 1 : finalizeFolder(child);
  }

  folder.documentCount = count;
  folder.children.sort(compareSiblings);
  return count;
};

/**
 * Builds a folder/file tree from flat diff rows by splitting `newFilename`
 * on `/` separators. Folders are sorted before files at each level.
 *
 * @param rows Flat diff rows produced by `buildDiffRows`.
 * @returns Roots of the diff tree.
 */
export const buildDiffTree = (rows: DiffRow[]): DiffTreeNode[] => {
  const root: DiffTreeFolder = {
    kind: 'folder',
    path: '',
    name: '',
    documentCount: 0,
    children: [],
  };

  for (const row of rows) {
    const segments = row.newFilename
      .split('/')
      .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      continue;
    }

    const folderSegments = segments.slice(0, -1);

    let cursor: DiffTreeFolder = root;
    let pathSoFar = '';

    for (const segment of folderSegments) {
      pathSoFar = pathSoFar.length === 0 ? segment : `${pathSoFar}/${segment}`;
      cursor = ensureChildFolder(cursor, segment, pathSoFar);
    }

    cursor.children.push({ kind: 'file', row });
  }

  finalizeFolder(root);

  return root.children;
};

/**
 * Recursively adds the `path` of every folder descendant (including `node`
 * itself when it is a folder) into `paths`. File leaves are skipped.
 *
 * @param node Tree node to walk.
 * @param paths Accumulator updated in place with folder paths.
 */
const collectFolderPathsFromNode = (
  node: DiffTreeNode,
  paths: Set<string>,
): void => {
  if (node.kind !== 'folder') {
    return;
  }

  paths.add(node.path);
  for (const child of node.children) {
    collectFolderPathsFromNode(child, paths);
  }
};

/**
 * Collects every folder path inside a diff tree, used to expand all folders by default.
 *
 * @param nodes Diff tree roots.
 * @returns Set of folder path keys present in the tree.
 */
export const collectAllFolderPaths = (nodes: DiffTreeNode[]): Set<string> => {
  const paths = new Set<string>();

  for (const node of nodes) {
    collectFolderPathsFromNode(node, paths);
  }

  return paths;
};

/**
 * Flattens the backend diff response into renderable rows sorted by filename.
 *
 * @param diff Diff response from the DMS API.
 * @returns A flat list of diff rows with stable keys, alphabetically sorted by the new filename.
 */
export const buildDiffRows = (diff: FileDiffResponse): DiffRow[] => {
  const rows: DiffRow[] = [];

  for (const file of diff.unchanged) {
    rows.push({
      key: `unchanged:${file.fileId}`,
      oldFilename: file.filename,
      newFilename: file.filename,
      changeType: 'unchanged',
      selectable: false,
    });
  }
  for (const file of diff.renamed) {
    rows.push({
      key: `renamed:${file.fileId}`,
      oldFilename: file.oldName,
      newFilename: file.newName,
      changeType: 'renamed',
      selectable: true,
    });
  }
  for (const file of diff.changed) {
    rows.push({
      key: `changed:${file.fileId}`,
      oldFilename: file.filename,
      newFilename: file.filename,
      changeType: 'replaced',
      selectable: true,
    });
  }
  for (const file of diff.deleted) {
    rows.push({
      key: `deleted:${file.fileId}`,
      oldFilename: file.filename,
      newFilename: file.filename,
      changeType: 'deleted',
      selectable: true,
    });
  }
  for (const file of diff.new) {
    rows.push({
      key: `new:${file.filename}`,
      oldFilename: null,
      newFilename: file.filename,
      changeType: 'new',
      selectable: false,
    });
  }

  return rows.sort((a, b) => a.newFilename.localeCompare(b.newFilename));
};

/**
 * Returns the set of row keys that are selectable, defaulting to all selected.
 *
 * @param rows Flattened diff rows.
 * @returns A set of keys for rows the user can include or exclude.
 */
export const buildDefaultSelectedKeys = (rows: DiffRow[]): Set<string> => {
  return new Set(rows.filter((row) => row.selectable).map((row) => row.key));
};

/**
 * Reconstructs a FileDiffResponse from the original diff and the user's selection.
 * New files are always kept because the backend requires a decision for every
 * computed entry and offers no "do not apply" decision for them; deselected
 * replaced, renamed, and deleted files are demoted into the unchanged bucket.
 *
 * @param diff Original diff returned by the backend.
 * @param selectedKeys Keys currently selected by the user.
 * @returns The trimmed diff to send back via setFileDiff.
 */
export const buildTrimmedDiff = (
  diff: FileDiffResponse,
  selectedKeys: Set<string>,
): FileDiffResponse => {
  const newFiles: NewFile[] = [...diff.new];
  const renamedFiles: RenameChange[] = [];
  const changedFiles: FileChange[] = [];
  const deletedFiles: DeleteChange[] = [];
  const unchangedFiles: Unchanged[] = [...diff.unchanged];

  for (const file of diff.changed) {
    const key = `changed:${file.fileId}`;
    if (selectedKeys.has(key)) {
      changedFiles.push(file);
      continue;
    }
    unchangedFiles.push({
      fileId: file.fileId,
      filename: file.filename,
      sha: file.targetSha,
    });
  }

  for (const file of diff.renamed) {
    const key = `renamed:${file.fileId}`;
    if (selectedKeys.has(key)) {
      renamedFiles.push(file);
      continue;
    }
    unchangedFiles.push({
      fileId: file.fileId,
      filename: file.oldName,
      sha: file.sha,
    });
  }

  for (const file of diff.deleted) {
    const key = `deleted:${file.fileId}`;
    if (selectedKeys.has(key)) {
      deletedFiles.push(file);
      continue;
    }
    unchangedFiles.push({
      fileId: file.fileId,
      filename: file.filename,
      sha: file.sha,
    });
  }

  return {
    new: newFiles,
    changed: changedFiles,
    renamed: renamedFiles,
    deleted: deletedFiles,
    unchanged: unchangedFiles,
  };
};
