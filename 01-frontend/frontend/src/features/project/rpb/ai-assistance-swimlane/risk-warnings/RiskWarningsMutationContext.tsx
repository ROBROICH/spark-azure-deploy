import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { canMutateRiskWarningForTopic } from './riskWarningMutationRights';
import type { Risk, RiskStatus } from './riskWarning.types';

type UseRiskWarningsMutationContextLogicParams = {
  canMutateProject: boolean;
  hasTopicMutationRights: (topicId: string) => boolean;
  onStatusChange: (risk: Risk, nextStatus: RiskStatus) => void;
  topicIdByVaeNodeId: ReadonlyMap<string, string | null | undefined>;
};

type RiskWarningsMutationProviderProps =
  UseRiskWarningsMutationContextLogicParams & {
    children: ReactNode;
  };

const getTopicIdForRisk = (
  topicIdByVaeNodeId: ReadonlyMap<string, string | null | undefined>,
  risk: Risk,
) => {
  if (!topicIdByVaeNodeId.has(risk.vae_node_id)) {
    return undefined;
  }

  return topicIdByVaeNodeId.get(risk.vae_node_id);
};

const useRiskWarningsMutationContextLogic = (
  params: UseRiskWarningsMutationContextLogicParams,
) => {
  const {
    canMutateProject,
    hasTopicMutationRights,
    onStatusChange,
    topicIdByVaeNodeId,
  } = params;
  const canChangeStatus = useCallback(
    (risk: Risk) =>
      canMutateRiskWarningForTopic(
        getTopicIdForRisk(topicIdByVaeNodeId, risk),
        {
          canMutateProject,
          hasTopicMutationRights,
        },
      ),
    [canMutateProject, hasTopicMutationRights, topicIdByVaeNodeId],
  );

  const changeStatus = useCallback(
    (risk: Risk, nextStatus: RiskStatus) => {
      if (!canChangeStatus(risk)) {
        return;
      }

      onStatusChange(risk, nextStatus);
    },
    [canChangeStatus, onStatusChange],
  );

  return useMemo(
    () => ({
      canChangeStatus,
      changeStatus,
    }),
    [canChangeStatus, changeStatus],
  );
};

type RiskWarningsMutationContextValue = ReturnType<
  typeof useRiskWarningsMutationContextLogic
>;

const RiskWarningsMutationContext =
  createContext<RiskWarningsMutationContextValue | null>(null);

export const useRiskWarningsMutationContext = () => {
  const context = useContext(RiskWarningsMutationContext);

  if (!context) {
    throw new Error(
      'useRiskWarningsMutationContext must be used inside RiskWarningsMutationProvider',
    );
  }

  return context;
};

export const RiskWarningsMutationProvider = (
  props: RiskWarningsMutationProviderProps,
) => {
  const {
    canMutateProject,
    children,
    hasTopicMutationRights,
    onStatusChange,
    topicIdByVaeNodeId,
  } = props;
  const value = useRiskWarningsMutationContextLogic({
    canMutateProject,
    hasTopicMutationRights,
    onStatusChange,
    topicIdByVaeNodeId,
  });

  return (
    <RiskWarningsMutationContext.Provider value={value}>
      {children}
    </RiskWarningsMutationContext.Provider>
  );
};
