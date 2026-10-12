import { createContext, useContext, type ReactNode } from 'react';

import type {
  BeschlussDraftAction,
  BeschlussDraftIssue,
} from './beschlussDraft';

export const NO_TOPIC_VALUE = '__none__';

export type DecisionTemplateTopicItem = {
  value: string;
  label: string;
};

export type DecisionTemplateContextValue = {
  knownTopics: ReadonlySet<string>;
  topicItems: DecisionTemplateTopicItem[];
  disabled: boolean;
  issues: BeschlussDraftIssue[];
  onDispatch: (action: BeschlussDraftAction) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (nodeId: string) => void;
};

const DecisionTemplateContext =
  createContext<DecisionTemplateContextValue | null>(null);

export type DecisionTemplateProviderProps = {
  value: DecisionTemplateContextValue;
  children: ReactNode;
};

export function DecisionTemplateProvider(props: DecisionTemplateProviderProps) {
  const { value, children } = props;
  return (
    <DecisionTemplateContext.Provider value={value}>
      {children}
    </DecisionTemplateContext.Provider>
  );
}

export const useDecisionTemplateContext = (): DecisionTemplateContextValue => {
  const value = useContext(DecisionTemplateContext);
  if (!value) {
    throw new Error('DecisionTemplateProvider is missing');
  }

  return value;
};
