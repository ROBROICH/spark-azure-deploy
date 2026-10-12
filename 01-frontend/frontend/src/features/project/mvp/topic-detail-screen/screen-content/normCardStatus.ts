import type { NodePayloadByType } from '@/db/nodes/types';
import type {
  AiNormCardAiStatus,
  AiNormCardReviewStatus,
} from '@/features/ui/cards/ai-norm-card/AiNormCard';

type NormCardAiStatusParams = {
  hasFundstelleDescendant: boolean | null;
  isStartAiAnalysisLoading: boolean;
  shouldShowUpdateAiAnalysis: boolean;
};

type NormCardAiWorkflowStateParams = {
  canMutateTopic: boolean;
  hasAtomareTbmDescendant: boolean;
  isBewertungWorkflowLoading: boolean;
  isBewertungWorkflowError: boolean;
  isBewertungWorkflowRunning: boolean;
  isRunning: boolean;
  isSuzWorkflowLoading: boolean;
  isSuzWorkflowError: boolean;
  isMutationPending: boolean;
};

export const getNormCardTitle = (norm: NodePayloadByType<'norm'>) => {
  return [`§ ${norm.paragraphNr}`, norm.paragraphTitel?.trim()]
    .filter(Boolean)
    .join(' ');
};

export const getNormCardAiWorkflowState = (
  params: NormCardAiWorkflowStateParams,
) => {
  const lacksAtomareTbmDescendant = !params.hasAtomareTbmDescendant;
  const isStartAiAnalysisLoading =
    params.hasAtomareTbmDescendant &&
    (params.isMutationPending ||
      params.isRunning ||
      params.isBewertungWorkflowRunning);
  const isStartAiAnalysisStatusUnavailable =
    params.isSuzWorkflowLoading ||
    params.isBewertungWorkflowLoading ||
    params.isSuzWorkflowError ||
    params.isBewertungWorkflowError;
  const isStartAiAnalysisDisabled = Boolean(
    isStartAiAnalysisLoading ||
    isStartAiAnalysisStatusUnavailable ||
    !params.canMutateTopic ||
    lacksAtomareTbmDescendant,
  );

  return {
    isStartAiAnalysisDisabled,
    isStartAiAnalysisLoading,
    lacksAtomareTbmDescendant,
  };
};

export const getNormCardAiStatus = (
  params: NormCardAiStatusParams,
): AiNormCardAiStatus => {
  const {
    hasFundstelleDescendant,
    isStartAiAnalysisLoading,
    shouldShowUpdateAiAnalysis,
  } = params;

  if (isStartAiAnalysisLoading) {
    return 'loading';
  }

  if (hasFundstelleDescendant === true) {
    return shouldShowUpdateAiAnalysis ? 'outdated' : 'current';
  }

  return 'start';
};

export const getNormCardReviewStatus = (
  mvpReviewStatus: NodePayloadByType<'topic_norm'>['mvpStatus'],
): AiNormCardReviewStatus => {
  if (mvpReviewStatus === 'needs_revision') {
    return 'recheck';
  }

  if (mvpReviewStatus === 'checked') {
    return 'checked';
  }

  return 'unchecked';
};
