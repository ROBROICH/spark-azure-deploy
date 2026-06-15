import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { RequiredDocumentNode } from '../data/schemas/requiredDocument.schema';
import {
  addDocumentToCustomCategory,
  getCustomCategoryId,
  hasDuplicateCustomDocumentName,
  removeDocumentFromTree,
  updateDocumentNameInTree,
} from './requiredDocumentsTree.utils';

type SetStructure = Dispatch<SetStateAction<RequiredDocumentNode[]>>;
type SetExpanded = Dispatch<SetStateAction<Set<string>>>;

/** Derives duplicate-name validation flags for the add and rename inputs. */
const getDuplicateNameValidation = (params: {
  localStructure: RequiredDocumentNode[];
  editingId: string | null;
  editingValue: string;
  newDocName: string;
}) => {
  const trimmedNew = params.newDocName.trim();
  const trimmedEditing = params.editingValue.trim();
  const isDuplicateNewDocumentName = hasDuplicateCustomDocumentName(
    params.localStructure,
    trimmedNew,
  );
  const isDuplicateEditingDocumentType =
    params.editingId !== null &&
    hasDuplicateCustomDocumentName(
      params.localStructure,
      trimmedEditing,
      params.editingId,
    );

  return {
    isDuplicateNewDocumentName,
    isDuplicateEditingDocumentType,
    hasDuplicateNewDocumentTypeError:
      isDuplicateNewDocumentName && Boolean(trimmedNew),
    hasDuplicateEditingDocumentTypeError:
      isDuplicateEditingDocumentType && Boolean(trimmedEditing),
  };
};

const useNodeExpansion = () => {
  // eslint-disable-next-line no-restricted-syntax -- expanded node ids only control local tree visibility
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNode = (nodeId: string) =>
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });

  return { expandedNodes, setExpandedNodes, toggleNode };
};

const useInlineRename = (
  localStructure: RequiredDocumentNode[],
  setLocalStructure: SetStructure,
) => {
  // eslint-disable-next-line no-restricted-syntax -- inline rename target is transient editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- inline rename input value is transient editor state
  const [editingValue, setEditingValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingValue(currentName);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const confirmEdit = () => {
    const trimmedName = editingValue.trim();
    if (
      editingId &&
      trimmedName &&
      !hasDuplicateCustomDocumentName(localStructure, trimmedName, editingId)
    ) {
      setLocalStructure((prev) =>
        updateDocumentNameInTree(prev, editingId, trimmedName),
      );
    }
    setEditingId(null);
    setEditingValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  return {
    editingId,
    editingValue,
    inputRef,
    setEditingValue,
    startEditing,
    confirmEdit,
    cancelEdit,
  };
};

const useAddRequiredDocument = (
  localStructure: RequiredDocumentNode[],
  setLocalStructure: SetStructure,
  setExpandedNodes: SetExpanded,
) => {
  // eslint-disable-next-line no-restricted-syntax -- add-document mode is transient editor state
  const [isAddingNew, setIsAddingNew] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- new document input value is transient editor state
  const [newDocName, setNewDocName] = useState('');
  const newInputRef = useRef<HTMLInputElement>(null);

  const startAddingNew = () => {
    setIsAddingNew(true);
    setNewDocName('');
    setTimeout(() => newInputRef.current?.focus(), 0);
  };

  const confirmAddNew = () => {
    const trimmedName = newDocName.trim();
    if (
      trimmedName &&
      !hasDuplicateCustomDocumentName(localStructure, trimmedName)
    ) {
      const customCategoryId = getCustomCategoryId(localStructure);
      const newDoc: RequiredDocumentNode = {
        id: crypto.randomUUID(),
        name: trimmedName,
      };
      setLocalStructure((prev) =>
        addDocumentToCustomCategory(prev, newDoc, customCategoryId),
      );
      if (customCategoryId) {
        setExpandedNodes((prev) => new Set(prev).add(customCategoryId));
      }
    }
    setIsAddingNew(false);
    setNewDocName('');
  };

  const cancelAddNew = () => {
    setIsAddingNew(false);
    setNewDocName('');
  };

  return {
    isAddingNew,
    newDocName,
    newInputRef,
    setNewDocName,
    startAddingNew,
    confirmAddNew,
    cancelAddNew,
  };
};

const useScrollAnchorIntoViewOnMount = (
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  addDocumentAnchorRef: React.RefObject<HTMLDivElement | null>,
) => {
  // eslint-disable-next-line no-restricted-syntax -- one-shot DOM scroll positioning so the add-document row is visible when the editor opens
  useEffect(() => {
    requestAnimationFrame(() => {
      const scrollContainer = scrollContainerRef.current;
      const addAnchor = addDocumentAnchorRef.current;
      if (!scrollContainer || !addAnchor) {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const anchorRect = addAnchor.getBoundingClientRect();
      const isFullyVisible =
        anchorRect.top >= containerRect.top &&
        anchorRect.bottom <= containerRect.bottom;

      if (!isFullyVisible) {
        addAnchor.scrollIntoView({ block: 'end' });
      }
    });
  }, [addDocumentAnchorRef, scrollContainerRef]);
};

type RequiredDocumentsEditorParams = {
  requiredDocumentsStructure: RequiredDocumentNode[];
};

/**
 * Owns the recursive required-documents editor state so the recursive
 * `RequiredDocumentsEditorNode` reads from context instead of forwarding a wide
 * prop bag at every level. The draft is initialized once from the tree on
 * mount; because the dialog is mounted only while open, a background refetch of
 * the source tree cannot clobber in-progress edits.
 */
const useRequiredDocumentsEditorContextLogic = (
  params: RequiredDocumentsEditorParams,
) => {
  // eslint-disable-next-line no-restricted-syntax -- draft tree is local to the temporary editor; initialized once from the source tree on mount
  const [localStructure, setLocalStructure] = useState<RequiredDocumentNode[]>(
    () => structuredClone(params.requiredDocumentsStructure),
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addDocumentAnchorRef = useRef<HTMLDivElement>(null);

  const expansion = useNodeExpansion();
  const rename = useInlineRename(localStructure, setLocalStructure);
  const add = useAddRequiredDocument(
    localStructure,
    setLocalStructure,
    expansion.setExpandedNodes,
  );
  useScrollAnchorIntoViewOnMount(scrollContainerRef, addDocumentAnchorRef);

  const validation = getDuplicateNameValidation({
    localStructure,
    editingId: rename.editingId,
    editingValue: rename.editingValue,
    newDocName: add.newDocName,
  });

  return {
    localStructure,
    customCategoryId: getCustomCategoryId(localStructure),
    scrollContainerRef,
    addDocumentAnchorRef,
    expandedNodes: expansion.expandedNodes,
    toggleNode: expansion.toggleNode,
    editingId: rename.editingId,
    editingValue: rename.editingValue,
    inputRef: rename.inputRef,
    setEditingValue: rename.setEditingValue,
    startEditing: rename.startEditing,
    confirmEdit: rename.confirmEdit,
    cancelEdit: rename.cancelEdit,
    removeDocument: (id: string) =>
      setLocalStructure((prev) => removeDocumentFromTree(prev, id)),
    isAddingNew: add.isAddingNew,
    newDocName: add.newDocName,
    newInputRef: add.newInputRef,
    setNewDocName: add.setNewDocName,
    startAddingNew: add.startAddingNew,
    confirmAddNew: add.confirmAddNew,
    cancelAddNew: add.cancelAddNew,
    ...validation,
  };
};

type RequiredDocumentsEditorContextValue = ReturnType<
  typeof useRequiredDocumentsEditorContextLogic
>;

const RequiredDocumentsEditorContext =
  createContext<RequiredDocumentsEditorContextValue | null>(null);

export const useRequiredDocumentsEditorContext = () => {
  const context = useContext(RequiredDocumentsEditorContext);
  if (context === null) {
    throw new Error(
      'useRequiredDocumentsEditorContext must be used within a RequiredDocumentsEditorProvider',
    );
  }
  return context;
};

type RequiredDocumentsEditorProviderProps = RequiredDocumentsEditorParams & {
  children: ReactNode;
};

export const RequiredDocumentsEditorProvider = (
  props: RequiredDocumentsEditorProviderProps,
) => {
  const { children, ...params } = props;
  const value = useRequiredDocumentsEditorContextLogic(params);

  return (
    <RequiredDocumentsEditorContext.Provider value={value}>
      {children}
    </RequiredDocumentsEditorContext.Provider>
  );
};
