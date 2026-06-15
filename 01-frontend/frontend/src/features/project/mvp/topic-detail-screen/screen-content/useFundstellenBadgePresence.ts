import { getRouteApi } from '@tanstack/react-router';
import { useMvpFundstellenContext } from './MvpFundstellenContext';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type FundstellenBadgePresenceProps = {
  documentId?: string;
  normId?: string;
  selectedDocumentId?: string;
  selectedNormId?: string;
};

export const useFundstellenBadgePresenceForSelection = (
  props: FundstellenBadgePresenceProps,
) => {
  const {
    hasAnyFundstellenForDocument,
    hasAnyFundstellenForNorm,
    hasFundstellenForDocumentAndNorm,
  } = useMvpFundstellenContext();

  if (props.documentId && props.normId) {
    return hasFundstellenForDocumentAndNorm(props.documentId, props.normId);
  }

  if (props.documentId) {
    if (props.selectedNormId) {
      return hasFundstellenForDocumentAndNorm(
        props.documentId,
        props.selectedNormId,
      );
    }

    return hasAnyFundstellenForDocument(props.documentId);
  }

  if (props.normId) {
    if (props.selectedDocumentId) {
      return hasFundstellenForDocumentAndNorm(
        props.selectedDocumentId,
        props.normId,
      );
    }

    return hasAnyFundstellenForNorm(props.normId);
  }

  return false;
};

export const useFundstellenBadgePresence = (props: {
  documentId?: string;
  normId?: string;
}) => {
  const routeSelection = route.useSearch({
    select: (search) => ({
      selectedDocumentId: search.selectedDocumentId,
      selectedNormId: search.selectedNormId,
    }),
  });

  return useFundstellenBadgePresenceForSelection({
    ...props,
    selectedDocumentId: routeSelection.selectedDocumentId,
    selectedNormId: routeSelection.selectedNormId,
  });
};
