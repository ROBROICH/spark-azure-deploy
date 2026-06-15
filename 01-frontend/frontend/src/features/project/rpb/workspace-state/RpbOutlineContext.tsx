import { useNodesByType } from '@/db/nodes/hooks/useNodesByType';
import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  type Context,
  type ReactNode,
} from 'react';
import {
  buildRpbOutlineTree,
  findRpbOutlineEffectiveTopicId,
  findRpbOutlineNodeById,
  resolveRpbOutlineMutationTopicId,
} from '../outline/rpbOutlineTree';
import { useRpbOutlineExpansionState } from './useRpbOutlineExpansionState';
import { useRpbOutlineCheckStateLogic } from './useRpbOutlineCheckStateLogic';
import { useRpbOutlineSelectionState } from './useRpbOutlineSelectionState';
import { useStableOutlineStructuralNodes } from './useStableOutlineStructuralNodes';

/**
 * Coordinates the shared RPB outline data path: live `vae_node` tree loading,
 * URL-backed selection/topic sync, and accordion expansion state.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- the provider coordinates one outline data flow before splitting the exposed API into narrower contexts
const useRpbOutlineContextLogic = () => {
  const { data: vaeNodes } = useNodesByType('vae_node');
  const outlineStructuralNodes = useStableOutlineStructuralNodes(vaeNodes);
  const canNormalizeOutlineNodeId = true;
  const outlineTree = useMemo(
    () => buildRpbOutlineTree(outlineStructuralNodes),
    [outlineStructuralNodes],
  );
  const checkState = useRpbOutlineCheckStateLogic({ outlineTree, vaeNodes });
  const {
    canNormalizeOutlineNodeId: canNormalizeSearchState,
    navigate,
    outlineNodeId,
    selectedOutlineNodeId,
    selectedTopicId,
    selectOutlineNode,
  } = useRpbOutlineSelectionState(outlineTree, canNormalizeOutlineNodeId);
  const {
    expandedNodeIds,
    expandedNodeIdSet,
    setExpandedNodeIds,
    expandAncestors,
  } = useRpbOutlineExpansionState(outlineTree, selectedOutlineNodeId);
  const selectedOutlineNode = useMemo(
    () => findRpbOutlineNodeById(outlineTree, selectedOutlineNodeId),
    [outlineTree, selectedOutlineNodeId],
  );
  const selectedOutlineAssignedTopicId = useMemo(
    () => findRpbOutlineEffectiveTopicId(outlineTree, selectedOutlineNodeId),
    [outlineTree, selectedOutlineNodeId],
  );
  const selectedOutlineMutationTopicId = useMemo(
    () =>
      selectedOutlineNode
        ? resolveRpbOutlineMutationTopicId(
            outlineStructuralNodes,
            selectedOutlineNodeId,
          )
        : undefined,
    [outlineStructuralNodes, selectedOutlineNode, selectedOutlineNodeId],
  );
  const handleSelectOutlineNode = useCallback(
    (nodeId: string) => {
      expandAncestors(nodeId);
      selectOutlineNode(nodeId);
    },
    [expandAncestors, selectOutlineNode],
  );
  // eslint-disable-next-line no-restricted-syntax -- invalid deep links must be normalized back to editor-backed outline IDs in router state
  useEffect(() => {
    if (!canNormalizeSearchState || !outlineNodeId) {
      return;
    }

    if (outlineNodeId === selectedOutlineNodeId) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        outlineNodeId: selectedOutlineNodeId,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [canNormalizeSearchState, navigate, outlineNodeId, selectedOutlineNodeId]);

  const treeState = useMemo(
    () => ({
      outlineTree,
    }),
    [outlineTree],
  );
  const selectionState = useMemo(
    () => ({
      selectOutlineNode: handleSelectOutlineNode,
      selectedOutlineNode,
      selectedOutlineAssignedTopicId,
      selectedOutlineMutationTopicId,
      selectedOutlineNodeId,
      selectedTopicId,
    }),
    [
      handleSelectOutlineNode,
      selectedOutlineNode,
      selectedOutlineAssignedTopicId,
      selectedOutlineMutationTopicId,
      selectedOutlineNodeId,
      selectedTopicId,
    ],
  );
  const expansionState = useMemo(
    () => ({
      expandedNodeIds,
      expandedNodeIdSet,
      setExpandedNodeIds,
    }),
    [expandedNodeIdSet, expandedNodeIds, setExpandedNodeIds],
  );
  return {
    checkState,
    expansionState,
    selectionState,
    treeState,
  };
};

type RpbOutlineState = ReturnType<typeof useRpbOutlineContextLogic>;
type RpbOutlineTreeState = RpbOutlineState['treeState'];
type RpbOutlineSelectionState = RpbOutlineState['selectionState'];
type RpbOutlineExpansionState = RpbOutlineState['expansionState'];
type RpbOutlineCheckState = RpbOutlineState['checkState'];

const RpbOutlineTreeContext = createContext<RpbOutlineTreeState | null>(null);
const RpbOutlineSelectionContext =
  createContext<RpbOutlineSelectionState | null>(null);
const RpbOutlineExpansionContext =
  createContext<RpbOutlineExpansionState | null>(null);
const RpbOutlineCheckContext = createContext<RpbOutlineCheckState | null>(null);

const useRequiredRpbOutlineContext = <T,>(
  context: Context<T | null>,
  hookName: string,
) => {
  const value = useContext(context);

  if (value === null) {
    throw new Error(`${hookName} must be used within a RpbOutlineProvider`);
  }

  return value;
};

export const useRpbOutlineTreeState = () => {
  return useRequiredRpbOutlineContext(
    RpbOutlineTreeContext,
    'useRpbOutlineTreeState',
  );
};

export const useRpbOutlineSelectionStateContext = () => {
  return useRequiredRpbOutlineContext(
    RpbOutlineSelectionContext,
    'useRpbOutlineSelectionStateContext',
  );
};

export const useRpbOutlineExpansionStateContext = () => {
  return useRequiredRpbOutlineContext(
    RpbOutlineExpansionContext,
    'useRpbOutlineExpansionStateContext',
  );
};

export const useRpbOutlineCheckState = () => {
  return useRequiredRpbOutlineContext(
    RpbOutlineCheckContext,
    'useRpbOutlineCheckState',
  );
};

export const useRpbVaeNodeUrlState = () => {
  const {
    selectedOutlineNode,
    selectedOutlineAssignedTopicId,
    selectedOutlineMutationTopicId,
    selectedOutlineNodeId,
    selectedTopicId,
    selectOutlineNode,
  } = useRpbOutlineSelectionStateContext();

  return {
    selectedTopicId,
    selectedVaeNodeAssignedTopicId: selectedOutlineAssignedTopicId,
    selectedVaeNodeMutationTopicId: selectedOutlineMutationTopicId,
    selectedVaeNode: selectedOutlineNode?.vaeNode ?? null,
    selectedVaeNodeId: selectedOutlineNodeId,
    onVaeNodeSelect: selectOutlineNode,
  };
};

type RpbOutlineProviderProps = {
  children: ReactNode;
};

export const RpbOutlineProvider = (props: RpbOutlineProviderProps) => {
  const { children } = props;
  const value = useRpbOutlineContextLogic();

  return (
    <RpbOutlineTreeContext.Provider value={value.treeState}>
      <RpbOutlineSelectionContext.Provider value={value.selectionState}>
        <RpbOutlineExpansionContext.Provider value={value.expansionState}>
          <RpbOutlineCheckContext.Provider value={value.checkState}>
            {children}
          </RpbOutlineCheckContext.Provider>
        </RpbOutlineExpansionContext.Provider>
      </RpbOutlineSelectionContext.Provider>
    </RpbOutlineTreeContext.Provider>
  );
};

export type { RpbOutlineState };
