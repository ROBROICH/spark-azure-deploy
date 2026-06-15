import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { getRouteApi } from '@tanstack/react-router';
import { useRef } from 'react';
import { DEFAULT_EWMS_TAB, isEwmsTab } from '../ewms.search';

const route = getRouteApi('/verfahren/$verfahrenId/ewms/');

const useEwmsDialogNavigation = () => {
  const navigate = route.useNavigate();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const openMutatingDialog = (
    key: 'importDialogOpen' | 'responseImportDialogOpen',
  ) => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      search: (prev) => ({
        ...prev,
        [key]: true,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleOpenImportDialog = () => openMutatingDialog('importDialogOpen');
  const handleOpenResponseImportDialog = () =>
    openMutatingDialog('responseImportDialogOpen');

  return { handleOpenImportDialog, handleOpenResponseImportDialog };
};

const useEwmsTabNavigation = () => {
  const navigate = route.useNavigate();

  const handleTabChange = (value: string) => {
    if (!isEwmsTab(value)) {
      return;
    }
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        tab: value === DEFAULT_EWMS_TAB ? undefined : value,
      }),
    });
  };

  return { handleTabChange };
};

/** Coordinates URL-backed EWMS row, topic, subtopic, and expansion selection. */
const useEwmsSelectionNavigation = () => {
  const navigate = route.useNavigate();

  const handleSelectObjection = (id: string) => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, selectedObjectionId: id }),
    });
  };

  const handleSelectTopic = (id: string) => {
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        selectedSubtopicId: undefined,
        selectedTopicId: id,
      }),
    });
  };

  const handleSelectSubtopic = (topicId: string, subtopicId: string) => {
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        expandedTopicGroupId: topicId,
        selectedSubtopicId: subtopicId,
        selectedTopicId: topicId,
      }),
    });
  };

  const handleExpandTopicGroup = (id: string) => {
    navigate({
      replace: true,
      search: (prev) => ({
        ...prev,
        expandedTopicGroupId: id === '' ? undefined : id,
      }),
    });
  };

  return {
    handleExpandTopicGroup,
    handleSelectObjection,
    handleSelectSubtopic,
    handleSelectTopic,
  };
};

const useEwmsArgumentNavigation = () => {
  const navigate = route.useNavigate();
  const argumentTriggerRef = useRef<HTMLElement | null>(null);

  const handleSelectArgument = (_id: string, trigger?: HTMLElement) => {
    argumentTriggerRef.current = trigger ?? null;
  };

  const handleArgumentBack = () => {
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, selectedArgumentId: undefined }),
    });
    argumentTriggerRef.current?.focus();
    argumentTriggerRef.current = null;
  };

  return { handleArgumentBack, handleSelectArgument };
};

export const useEwmsWorkspaceNavigation = () => {
  const argumentNavigation = useEwmsArgumentNavigation();
  const dialogNavigation = useEwmsDialogNavigation();
  const selectionNavigation = useEwmsSelectionNavigation();
  const tabNavigation = useEwmsTabNavigation();

  return {
    ...argumentNavigation,
    ...dialogNavigation,
    ...selectionNavigation,
    ...tabNavigation,
  };
};
