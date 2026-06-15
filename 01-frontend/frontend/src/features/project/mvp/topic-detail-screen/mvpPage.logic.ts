import type { MvpLaneOrderPreference, MvpLeftPanelTab } from './mvp.search';

export const findConnectedProjectDocumentId = (
  topicDocuments: { dms_file_id: string; id: string }[],
  previewDocumentId: string | undefined,
) => {
  const topicDocument = topicDocuments.find(
    (document) => document.id === previewDocumentId,
  );
  if (topicDocument) {
    return topicDocument.dms_file_id;
  }

  return undefined;
};

export const getPreferredPrimaryLaneId = (
  laneOrderPreference: MvpLaneOrderPreference,
): MvpLeftPanelTab => {
  return laneOrderPreference === 'documentsFirst'
    ? 'dokumente'
    : 'rechtsgrundlage';
};

export const getLeftPanelTabSearchValue = (
  nextLeftPanelTab: MvpLeftPanelTab,
  laneOrderPreference: MvpLaneOrderPreference,
) => {
  return nextLeftPanelTab === getPreferredPrimaryLaneId(laneOrderPreference)
    ? undefined
    : nextLeftPanelTab;
};

export const getLaneOrderSearchState = (params: {
  currentLaneOrder: MvpLaneOrderPreference;
  currentLeftPanelTab: MvpLeftPanelTab | undefined;
  nextLaneOrder: MvpLaneOrderPreference;
}) => {
  const { currentLaneOrder, currentLeftPanelTab, nextLaneOrder } = params;
  const currentActiveLane =
    currentLeftPanelTab ?? getPreferredPrimaryLaneId(currentLaneOrder);

  return {
    laneOrder: nextLaneOrder,
    leftPanelTab: getLeftPanelTabSearchValue(currentActiveLane, nextLaneOrder),
  };
};
