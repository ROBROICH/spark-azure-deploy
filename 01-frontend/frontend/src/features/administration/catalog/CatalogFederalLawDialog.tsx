import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { LawNormPicker } from '@/features/shared/legal-basis-picker/LawNormPicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';
import {
  catalogNormsByIdentity,
  legalBasisItemToCatalogNorm,
  selectedCatalogNorms,
  toPickerGroups,
  toggleGroupSelection,
  withUnavailablePersistedNorms,
} from './catalogLegalBasisPicker';
import {
  completeLawLegalBasisNormsQueryOptions,
  federalLegalBasisNormsQueryOptions,
  type LegalBasisNormItem,
} from './legalBasisNormQuery';

export type CatalogFederalLawDialogProps = {
  open: boolean;
  persistedPruefungsNorms: CatalogNorm[];
  persistedVerfahrensNorms: CatalogNorm[];
  onOpenChange: (open: boolean) => void;
  onApply: (selected: CatalogNorm[]) => void;
};

/**
 * Renders an isolated federal-law selection draft.
 *
 * @param props Persisted lists and dialog callbacks.
 * @returns Federal-law picker dialog content.
 */
const CatalogFederalLawDialogBody = (
  props: Omit<CatalogFederalLawDialogProps, 'open'>,
) => {
  const {
    persistedPruefungsNorms,
    persistedVerfahrensNorms,
    onOpenChange,
    onApply,
  } = props;
  const { t } = useTranslation('Administration');
  const queryClient = useQueryClient();
  const persisted = [...persistedPruefungsNorms, ...persistedVerfahrensNorms];
  const query = useQuery(federalLegalBasisNormsQueryOptions(true));
  // eslint-disable-next-line no-restricted-syntax -- complete-law pages stay local until Apply
  const [completeLawItems, setCompleteLawItems] = useState<
    LegalBasisNormItem[]
  >([]);
  // eslint-disable-next-line no-restricted-syntax -- parent-select fetch is local to this dialog
  const [loadingLawIds, setLoadingLawIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pendingLawIdsRef = useRef(new Set<string>());
  // eslint-disable-next-line no-restricted-syntax -- dialog draft selection is discarded on close
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(persisted.map(normIdentityKey)),
  );

  const combinedItems = [...(query.data ?? []), ...completeLawItems];
  const built = toPickerGroups(combinedItems, null);
  const withUnavailable = withUnavailablePersistedNorms(
    built.groups,
    new Map([...built.normsById, ...catalogNormsByIdentity(persisted)]),
    persisted,
  );
  const pickerStatus = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : withUnavailable.groups.length === 0
        ? 'empty'
        : 'ready';

  const handleToggleGroup = async (groupId: string) => {
    const group = withUnavailable.groups.find(
      (candidate) => candidate.id === groupId,
    );
    if (!group || pendingLawIdsRef.current.has(groupId)) {
      return;
    }

    pendingLawIdsRef.current.add(groupId);
    setLoadingLawIds((current) => new Set(current).add(groupId));
    try {
      const items = await queryClient.fetchQuery(
        completeLawLegalBasisNormsQueryOptions({ jurabk: group.label }),
      );
      setCompleteLawItems((current) => [...current, ...items]);
      const completeIds = items.map((item) =>
        normIdentityKey(legalBasisItemToCatalogNorm(item)),
      );
      const groupNormIds = [
        ...new Set([...group.norms.map((norm) => norm.id), ...completeIds]),
      ];
      const selectableNormIds = [
        ...new Set([
          ...group.norms
            .filter((norm) => norm.unavailable !== true)
            .map((norm) => norm.id),
          ...completeIds,
        ]),
      ];
      setSelectedIds((current) =>
        toggleGroupSelection(current, groupNormIds, selectableNormIds),
      );
    } catch {
      toast.error(t('catalog.legalBasis.loadError'));
    } finally {
      pendingLawIdsRef.current.delete(groupId);
      setLoadingLawIds((current) => {
        const next = new Set(current);
        next.delete(groupId);
        return next;
      });
    }
  };

  return (
    <DialogContent
      showCloseButton
      className="h-[80vh] sm:max-w-3xl"
      innerClassName="flex-1"
    >
      <DialogHeader>
        <DialogTitle>{t('catalog.legalBasis.federalTitle')}</DialogTitle>
      </DialogHeader>
      <DialogDescription className="px-4 pt-4 text-[13px] leading-[18px] text-neutral-600">
        {t('catalog.legalBasis.federalDescription')}
      </DialogDescription>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <LawNormPicker
          groups={withUnavailable.groups.map((group) => ({
            ...group,
            isLoadingComplete: loadingLawIds.has(group.id),
          }))}
          selectedIds={selectedIds}
          status={pickerStatus}
          onToggleNorm={(id) => {
            const norm = withUnavailable.groups
              .flatMap((group) => group.norms)
              .find((candidate) => candidate.id === id);
            if (norm?.unavailable === true && !selectedIds.has(id)) {
              return;
            }

            setSelectedIds((current) => {
              const next = new Set(current);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          }}
          onToggleGroup={(groupId) => {
            void handleToggleGroup(groupId);
          }}
          onRetry={() => {
            void query.refetch();
          }}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onOpenChange(false)}
        >
          {t('catalog.legalBasis.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={query.isPending || loadingLawIds.size > 0}
          onClick={() => {
            onApply(
              selectedCatalogNorms(selectedIds, withUnavailable.normsById),
            );
            onOpenChange(false);
          }}
        >
          {t('catalog.legalBasis.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export function CatalogFederalLawDialog(props: CatalogFederalLawDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CatalogFederalLawDialogBody
          persistedPruefungsNorms={props.persistedPruefungsNorms}
          persistedVerfahrensNorms={props.persistedVerfahrensNorms}
          onOpenChange={onOpenChange}
          onApply={props.onApply}
        />
      ) : null}
    </Dialog>
  );
}
