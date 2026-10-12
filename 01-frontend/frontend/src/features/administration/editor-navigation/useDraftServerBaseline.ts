import { useEffect, useRef } from 'react';

export type DraftServerBaselineOptions<TBaseline, TSnapshot> = {
  serverSnapshot: TSnapshot;
  serverBaseline: TBaseline;
  draft: TBaseline;
  isDirty: (draft: TBaseline, baseline: TBaseline) => boolean;
  replaceDraft: (baseline: TBaseline) => void;
  onPreserveDirtyDraft?: () => void;
};

/**
 * Reconciles a mounted draft with refreshed server props. Clean drafts follow
 * the server, while dirty drafts survive refetches and keep the snapshot they
 * were opened from, so a save never pairs older edits with a newer revision.
 * Explicit restore and an adopted save move the draft to a new snapshot.
 */
export function useDraftServerBaseline<TBaseline, TSnapshot>(
  options: DraftServerBaselineOptions<TBaseline, TSnapshot>,
) {
  const latestBaselineRef = useRef(options.serverBaseline);
  latestBaselineRef.current = options.serverBaseline;
  const latestSnapshotRef = useRef(options.serverSnapshot);
  latestSnapshotRef.current = options.serverSnapshot;
  const draftSnapshotRef = useRef(options.serverSnapshot);

  const draftRef = useRef(options.draft);
  draftRef.current = options.draft;

  const previousSnapshotRef = useRef(options.serverSnapshot);
  const previousBaselineRef = useRef(options.serverBaseline);
  const isDirtyRef = useRef(options.isDirty);
  isDirtyRef.current = options.isDirty;
  const replaceDraftRef = useRef(options.replaceDraft);
  replaceDraftRef.current = options.replaceDraft;
  const onPreserveDirtyDraftRef = useRef(options.onPreserveDirtyDraft);
  onPreserveDirtyDraftRef.current = options.onPreserveDirtyDraft;

  // eslint-disable-next-line no-restricted-syntax -- reconciles local reducer state with an immutable TanStack Query server snapshot
  useEffect(() => {
    if (
      Object.is(previousSnapshotRef.current, options.serverSnapshot) &&
      Object.is(previousBaselineRef.current, options.serverBaseline)
    ) {
      return;
    }

    const draftWasDirty = isDirtyRef.current(
      draftRef.current,
      previousBaselineRef.current,
    );
    previousSnapshotRef.current = options.serverSnapshot;
    previousBaselineRef.current = options.serverBaseline;

    if (draftWasDirty) {
      onPreserveDirtyDraftRef.current?.();
      return;
    }

    draftSnapshotRef.current = options.serverSnapshot;
    replaceDraftRef.current(options.serverBaseline);
  }, [options.serverBaseline, options.serverSnapshot]);

  return {
    draftSnapshot: () => draftSnapshotRef.current,
    restoreLatestServerBaseline: () => {
      draftSnapshotRef.current = latestSnapshotRef.current;
      replaceDraftRef.current(latestBaselineRef.current);
    },
    adoptSaved: (snapshot: TSnapshot, baseline: TBaseline) => {
      draftSnapshotRef.current = snapshot;
      previousSnapshotRef.current = snapshot;
      previousBaselineRef.current = baseline;
      replaceDraftRef.current(baseline);
    },
  };
}
