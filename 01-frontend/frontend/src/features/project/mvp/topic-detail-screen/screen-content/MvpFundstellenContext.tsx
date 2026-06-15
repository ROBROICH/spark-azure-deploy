import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import {
  createMvpFundstellenContextValue,
  type MvpFundstellenContextValue,
  useMvpFundstellenRefIndexes,
} from './mvpFundstellenContext.logic';

type MvpFundstellenProviderParams = {
  topicId: string;
};

/**
 * Builds topic-scoped fundstellen presence from graph refs without loading
 * the full fundstelle payload set for the whole topic.
 */
const useMvpFundstellenContextLogic = (
  params: MvpFundstellenProviderParams,
) => {
  const { index } = useGraph();
  const topicRef = { id: params.topicId, node_type: 'topic' as const };
  const fundstellenRefs = useDescendants('fundstelle', topicRef);
  const {
    documentIdsWithFundstellen,
    documentNormPairs,
    normIdsWithFundstellen,
  } = useMvpFundstellenRefIndexes(index, fundstellenRefs);

  return useMemo(
    () =>
      createMvpFundstellenContextValue({
        documentIdsWithFundstellen,
        documentNormPairs,
        normIdsWithFundstellen,
      }),
    [documentIdsWithFundstellen, documentNormPairs, normIdsWithFundstellen],
  );
};

const MvpFundstellenContext = createContext<MvpFundstellenContextValue | null>(
  null,
);

export const useMvpFundstellenContext = () => {
  const context = useContext(MvpFundstellenContext);

  if (context === null) {
    throw new Error(
      'useMvpFundstellenContext must be used within MvpFundstellenProvider',
    );
  }

  return context;
};

type MvpFundstellenProviderProps = MvpFundstellenProviderParams & {
  children: ReactNode;
};

export const MvpFundstellenProvider = (props: MvpFundstellenProviderProps) => {
  const { children, ...params } = props;
  const value = useMvpFundstellenContextLogic(params);

  return (
    <MvpFundstellenContext.Provider value={value}>
      {children}
    </MvpFundstellenContext.Provider>
  );
};
