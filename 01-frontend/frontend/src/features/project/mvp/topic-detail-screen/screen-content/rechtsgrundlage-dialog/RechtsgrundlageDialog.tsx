import { Accordion } from '@/features/ui/accordion/Accordion';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { useAction } from '@/db/nodes/hooks/useAction';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAvailableRechtsgrundlageData } from '../../screen-data/useRechtsgrundlageData';
import { LawGroupRow } from './LawGroupRow';
import {
  saveNormSelectionChanges,
  type NormSelectionDraftModes,
  type NormSelectionMode,
} from './saveNormSelectionChanges';

const topicRoute = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');
const projectRoute = getRouteApi('/verfahren/$verfahrenId');
const NODE_SUMMARIES_REFETCH_DELAY_MS = 3000;

type RechtsgrundlageDialogProps = {
  canMutateTopic: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const RechtsgrundlageDialogContentSkeleton = () => {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Skeleton className="mb-4 h-4 w-5/6" aria-hidden />
        <div className="flex flex-col gap-2" {...skeletonListProps}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[8px] border border-border-primary p-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-4 rounded-sm" aria-hidden />
                <Skeleton className="h-4 flex-1" aria-hidden />
                <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <hr className="border-t-[0.5px] border-neutral-300" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-28 rounded-lg" aria-hidden />
          <Skeleton className="h-10 w-28 rounded-lg" aria-hidden />
        </div>
      </div>
    </>
  );
};

type ResolvedRechtsgrundlageDialogContentProps = {
  canMutateTopic: boolean;
  isSaving: boolean;
  onDidPersistChanges: () => void;
  onOpenChange: (open: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
};

/**
 * Loads the complete Rechtsgrundlage corpus only after the dialog shell is
 * visible, then renders the editable selection controls.
 *
 * Existing topic-linked norms can be marked for removal, while unselected
 * norms can be marked for addition. The draft is stored as explicit save
 * modes until persisted.
 */
const ResolvedRechtsgrundlageDialogContent = (
  props: ResolvedRechtsgrundlageDialogContentProps,
) => {
  const {
    canMutateTopic,
    isSaving,
    onDidPersistChanges,
    onOpenChange,
    setIsSaving,
  } = props;
  const { topicName } = topicRoute.useParams();
  const { transact, insert, update, delete: deleteNode } = useAction();
  const { availableLawGroups, availableNormEntries, selectedNormIds } =
    useAvailableRechtsgrundlageData();
  const { t } = useTranslation('MvpRedesign');
  // eslint-disable-next-line no-restricted-syntax -- draft add/remove modes are local to the dialog until persisted
  const [draftModes, setDraftModes] = useState<NormSelectionDraftModes>({});

  const getNormSelectionMode = (
    normId: string,
    state: NormSelectionDraftModes = draftModes,
  ) => state[normId];

  const isNormSelected = (
    normId: string,
    state: NormSelectionDraftModes = draftModes,
  ) => {
    const mode = getNormSelectionMode(normId, state);

    if (mode === 'add') {
      return true;
    }

    if (mode === 'remove') {
      return false;
    }

    return selectedNormIds.has(normId);
  };

  const setNormSelection = (normId: string, nextSelected: boolean) => {
    setDraftModes((prev) => {
      const existingSelected = selectedNormIds.has(normId);
      const next = { ...prev };

      if (nextSelected === existingSelected) {
        delete next[normId];
        return next;
      }

      next[normId] = nextSelected ? 'add' : 'remove';
      return next;
    });
  };

  const toggleNorm = (normId: string) => {
    setNormSelection(normId, !isNormSelected(normId));
  };

  /**
   * Stores only explicit add/remove draft modes while persisted selections remain
   * implicit, so unchanged group members do not enter the save payload.
   *
   * @param lawGroupId - Law group whose norms should switch together.
   */
  const toggleGroup = (lawGroupId: string) => {
    const groupNormIds =
      availableLawGroups
        .find((lawGroup) => lawGroup.id === lawGroupId)
        ?.norms.map((norm) => norm.norm.id) ?? [];

    if (groupNormIds.length === 0) {
      return;
    }

    setDraftModes((prev) => {
      const shouldUnselectGroup = groupNormIds.every((normId) =>
        isNormSelected(normId, prev),
      );
      const next = { ...prev };

      for (const normId of groupNormIds) {
        const existingSelected = selectedNormIds.has(normId);
        const nextSelected = !shouldUnselectGroup;
        const nextMode: NormSelectionMode | undefined =
          nextSelected === existingSelected
            ? undefined
            : nextSelected
              ? 'add'
              : 'remove';

        if (nextMode) {
          next[normId] = nextMode;
        } else {
          delete next[normId];
        }
      }

      return next;
    });
  };

  const handleSave = async () => {
    if (!canMutateTopic) {
      return;
    }

    const hasInvalidLawSelection = availableNormEntries.some((normEntry) => {
      return draftModes[normEntry.norm.id] === 'add' && !normEntry.gesetz;
    });

    if (hasInvalidLawSelection) {
      toast.error(t('RechtsgrundlageDialog.errors.missingLawReference'));
      return;
    }

    setIsSaving(true);

    try {
      const didPersist = await saveNormSelectionChanges({
        availableNormEntries,
        draftModes,
        topicId: topicName,
        transact,
        insert,
        update,
        deleteNode,
      });

      if (!didPersist) {
        onOpenChange(false);
        setIsSaving(false);
        return;
      }

      onDidPersistChanges();
      onOpenChange(false);
      setIsSaving(false);
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('RechtsgrundlageDialog.errors.saveFailed'));
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isSaving) {
      return;
    }

    onOpenChange(false);
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Accordion className="flex flex-col gap-2">
          {availableLawGroups.map((group) => (
            <LawGroupRow
              key={group.id}
              lawGroup={group}
              norms={group.norms}
              isNormSelected={isNormSelected}
              onToggleNorm={toggleNorm}
              onToggleGroup={toggleGroup}
            />
          ))}
        </Accordion>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <hr className="border-t-[0.5px] border-neutral-300" />
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {t('RechtsgrundlageDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={!canMutateTopic}
            loading={isSaving}
          >
            {t('RechtsgrundlageDialog.save')}
          </Button>
        </div>
      </div>
    </>
  );
};

/**
 * Dialog shell for attaching additional norm nodes to the active topic.
 */
export const RechtsgrundlageDialog = (props: RechtsgrundlageDialogProps) => {
  const { canMutateTopic, onOpenChange, open } = props;
  const { refetchNodeSummaries } = projectRoute.useLoaderData();
  const { t } = useTranslation('MvpRedesign');
  // eslint-disable-next-line no-restricted-syntax -- save progress is local to this dialog while persistence is in flight
  const [isSaving, setIsSaving] = useState(false);
  const delayedRefetchTimeoutRef = useRef<number | null>(null);

  // eslint-disable-next-line no-restricted-syntax -- owns and clears delayed summary refetches for this page-mounted dialog shell.
  useEffect(() => {
    return () => {
      if (delayedRefetchTimeoutRef.current === null) {
        return;
      }

      window.clearTimeout(delayedRefetchTimeoutRef.current);
      delayedRefetchTimeoutRef.current = null;
    };
  }, []);

  const scheduleNodeSummariesRefetch = () => {
    if (delayedRefetchTimeoutRef.current !== null) {
      window.clearTimeout(delayedRefetchTimeoutRef.current);
    }

    delayedRefetchTimeoutRef.current = window.setTimeout(() => {
      delayedRefetchTimeoutRef.current = null;
      void Promise.resolve(refetchNodeSummaries()).catch((error) => {
        Sentry.captureException(error);
        toast.error(t('RechtsgrundlageDialog.errors.saveFailed'));
      });
    }, NODE_SUMMARIES_REFETCH_DELAY_MS);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSaving && !nextOpen) {
      return;
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="h-[80vh] sm:max-w-3xl"
        innerClassName="flex-1"
      >
        <DialogHeader>
          <DialogTitle>{t('RechtsgrundlageDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="px-4 pt-4 text-[13px] leading-[18px] text-neutral-600">
          {t('RechtsgrundlageDialog.description')}
        </DialogDescription>

        <Suspense fallback={<RechtsgrundlageDialogContentSkeleton />}>
          <ResolvedRechtsgrundlageDialogContent
            canMutateTopic={canMutateTopic}
            isSaving={isSaving}
            onDidPersistChanges={scheduleNodeSummariesRefetch}
            onOpenChange={onOpenChange}
            setIsSaving={setIsSaving}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};
