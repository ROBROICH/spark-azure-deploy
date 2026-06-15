import { createContext, useContext, type ReactNode } from 'react';
import type { FeedbackTargetRef } from './feedbackTarget';
import {
  useFeedbackLookup,
  type FeedbackLookupEntry,
} from './useFeedbackLookup';

type FeedbackLookupContextValue = ReturnType<typeof useFeedbackLookup>;

const FeedbackLookupContext = createContext<FeedbackLookupContextValue | null>(
  null,
);

export function FeedbackLookupProvider(props: {
  children: ReactNode;
  targetRefs: ReadonlyArray<FeedbackTargetRef>;
}) {
  const { children, targetRefs } = props;
  const lookup = useFeedbackLookup(targetRefs);

  return (
    <FeedbackLookupContext.Provider value={lookup}>
      {children}
    </FeedbackLookupContext.Provider>
  );
}

export function useFeedbackForTarget(
  targetRef: FeedbackTargetRef,
): FeedbackLookupEntry {
  const lookup = useContext(FeedbackLookupContext);

  if (!lookup) {
    throw new Error(
      'NodeFeedbackThumbButtons must be rendered inside FeedbackLookupProvider',
    );
  }

  return lookup.getFeedbackForTarget(targetRef);
}
