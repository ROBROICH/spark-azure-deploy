import { useGraph } from '@/db/nodes/ProjectGraphProvider';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import type { NodeRefByType } from '@/db/nodes/types';
import { getRouteApi } from '@tanstack/react-router';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
  EwmsObjectionSort,
  ObjectionsFilter,
} from '../data/ewms.nodes';
import {
  findEwmsObjectionItemBySelection,
  getEwmsArgumentsForTopicSelection,
  groupArgumentsByTopicId,
  isEwmsArgumentApproved,
  matchesBeteiligungsEingangFilter,
  matchesEwmsObjectionFilenameSearch,
  matchesEwmsObjectionItemFilter,
  sortEwmsArguments,
} from '../data/ewms.nodes';
import { DEFAULT_EWMS_TAB } from '../ewms.search';
import { useEwmsResponseExport } from '../response-export/useEwmsResponseExport';
import { useEwmsArgumentMutations } from './useEwmsArgumentMutations';
import { useEwmsWorkspaceNavigation } from './useEwmsWorkspaceNavigation';

const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

const asBeteiligungsEingangRef = (
  id: string | null | undefined,
): NodeRefByType<'beteiligungs_eingang'> | null =>
  id ? { id, node_type: 'beteiligungs_eingang' } : null;

const getVisibleArguments = (
  allArguments: EwmsArgumentNode[],
  objectionItems: EwmsObjectionListItem[],
) => {
  const visibleEntryIds = new Set(objectionItems.map((item) => item.entry.id));
  return sortEwmsArguments(allArguments).filter((argument) =>
    visibleEntryIds.has(argument.beteiligungs_eingang_id),
  );
};

const useEwmsWorkspaceData = (params: {
  selectedObjectionId: string | undefined;
  selectedSubtopicId: string | undefined;
  selectedTopicId: string | undefined;
}) => {
  const { selectedObjectionId, selectedSubtopicId, selectedTopicId } = params;
  const { getNodesByType } = useGraph();
  const { data: topics } = useTopicNodes();
  const entryRefs = getNodesByType('beteiligungs_eingang');
  const argumentRefs = getNodesByType('argument');
  const { data: objections, isLoading: objectionsLoading } =
    useLiveNodes(entryRefs);
  const { data: allArguments, isLoading: argumentsLoading } =
    useLiveNodes(argumentRefs);
  const objectionItems = objections.map((entry) => ({ entry }));
  const selectedObjectionItem = findEwmsObjectionItemBySelection(
    objectionItems,
    selectedObjectionId,
  );
  const selectedEntryRef = asBeteiligungsEingangRef(
    selectedObjectionItem?.entry.id,
  );
  const selectedEntryArgumentRefs = useDescendants(
    'argument',
    selectedEntryRef,
  );
  const {
    data: selectedObjectionArguments,
    isLoading: selectedObjectionArgumentsLoading,
  } = useLiveNodes(selectedEntryArgumentRefs);
  const sortedSelectedObjectionArguments = sortEwmsArguments(
    selectedObjectionArguments,
  );
  const visibleArguments = getVisibleArguments(allArguments, objectionItems);
  const entriesById = new Map(
    objectionItems.map((item) => [item.entry.id, item.entry] as const),
  );
  const argumentsByTopicId = groupArgumentsByTopicId(visibleArguments);
  const selectedTopicArguments = getEwmsArgumentsForTopicSelection(
    argumentsByTopicId,
    selectedTopicId,
    selectedSubtopicId,
  );
  const checkedCount = visibleArguments.filter((argument) =>
    isEwmsArgumentApproved(argument),
  ).length;

  return {
    allArguments: visibleArguments,
    checkedCount,
    entriesById,
    ewmsWorkspaceDataLoading:
      objectionItems.length === 0 && (objectionsLoading || argumentsLoading),
    ewmsDocumentsLoadingMore: false,
    objectionItems,
    objections,
    selectedObjectionArguments: sortedSelectedObjectionArguments,
    selectedObjectionArgumentsLoading,
    selectedTopicArguments,
    topics,
  };
};

/** Updates URL-backed objection filter, filename search, sort, and selection state. */
const useEwmsObjectionsNavigation = (params: {
  objectionItems: EwmsObjectionListItem[];
  objections: EwmsBeteiligungsEingang[];
}) => {
  const { objectionItems, objections } = params;
  const navigate = route.useNavigate();

  const handleFilterChange = (value: ObjectionsFilter) => {
    navigate({
      replace: true,
      search: (prev) => {
        const selectedObjection = objections.find(
          (objection) => objection.id === prev.selectedObjectionId,
        );
        const selectedItem = findEwmsObjectionItemBySelection(
          objectionItems,
          prev.selectedObjectionId,
        );
        const shouldClearSelection =
          (selectedObjection &&
            !matchesBeteiligungsEingangFilter(selectedObjection, value)) ||
          (selectedItem &&
            !matchesEwmsObjectionItemFilter(selectedItem, value));

        return {
          ...prev,
          objectionsFilter: value,
          selectedObjectionId: shouldClearSelection
            ? undefined
            : prev.selectedObjectionId,
        };
      },
    });
  };

  const handleSortChange = (value: EwmsObjectionSort) => {
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        objectionsSort: value,
      }),
    });
  };

  const handleSearchChange = (value: string) => {
    navigate({
      replace: true,
      search: (prev) => {
        const search = value.trim() || undefined;
        const selectedItem = findEwmsObjectionItemBySelection(
          objectionItems,
          prev.selectedObjectionId,
        );
        const shouldClearSelection =
          selectedItem !== undefined &&
          !matchesEwmsObjectionFilenameSearch(selectedItem, search);

        return {
          ...prev,
          objectionsSearch: search,
          selectedObjectionId: shouldClearSelection
            ? undefined
            : prev.selectedObjectionId,
        };
      },
    });
  };

  return { handleFilterChange, handleSearchChange, handleSortChange };
};

export const useEwmsWorkspace = () => {
  const {
    objectionsFilter,
    objectionsSearch,
    selectedObjectionId,
    selectedSubtopicId,
    selectedTopicId,
    expandedTopicGroupId,
    selectedArgumentId,
    objectionsSort,
    tab: routeTab,
  } = route.useSearch();
  const { verfahrenId } = route.useParams();
  const tab = routeTab === undefined ? DEFAULT_EWMS_TAB : routeTab;
  const selectedArgumentRef = selectedArgumentId
    ? ({ id: selectedArgumentId, node_type: 'argument' } as const)
    : null;
  const data = useEwmsWorkspaceData({
    selectedObjectionId,
    selectedSubtopicId,
    selectedTopicId,
  });
  const navigation = useEwmsWorkspaceNavigation();
  const objectionsNavigation = useEwmsObjectionsNavigation({
    objectionItems: data.objectionItems,
    objections: data.objections,
  });
  const mutations = useEwmsArgumentMutations();
  const responseExport = useEwmsResponseExport(verfahrenId);

  return {
    ...data,
    ...navigation,
    ...objectionsNavigation,
    ...mutations,
    ...responseExport,
    expandedTopicGroupId,
    objectionsFilter,
    objectionsSearch,
    objectionsSort,
    selectedArgumentRef,
    selectedObjectionId,
    selectedSubtopicId,
    selectedTopicId,
    tab,
  };
};
