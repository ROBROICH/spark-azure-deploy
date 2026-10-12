import { LawNormPicker } from '@/features/shared/legal-basis-picker/LawNormPicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { FederalStateCode } from '@/features/project/data/project-details-form/federalStates';

import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';
import {
  catalogNormsByIdentity,
  legalBasisItemToCatalogNorm,
  toPickerGroups,
  toggleGroupSelection,
  withUnavailablePersistedNorms,
} from './catalogLegalBasisPicker';
import {
  completeLawLegalBasisNormsQueryOptions,
  stateLegalBasisNormsQueryOptions,
  type LegalBasisNormItem,
} from './legalBasisNormQuery';

type CatalogStateLawPickerProps = {
  stateCode: FederalStateCode;
  persisted: CatalogNorm[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (update: (current: Set<string>) => Set<string>) => void;
  normsById: Map<string, CatalogNorm>;
  onNormsByIdChange: (
    update: (current: Map<string, CatalogNorm>) => Map<string, CatalogNorm>,
  ) => void;
  onLoadingChange: (lawId: string, loading: boolean) => void;
};

/**
 * Renders one state's isolated law picker and loads full laws on demand.
 *
 * @param props State selection and functional update callbacks.
 * @returns A state-filtered law and norm picker.
 */
export const CatalogStateLawPicker = (props: CatalogStateLawPickerProps) => {
  const {
    stateCode,
    persisted,
    selectedIds,
    onSelectedIdsChange,
    normsById,
    onNormsByIdChange,
    onLoadingChange,
  } = props;
  const { t } = useTranslation('Administration');
  const queryClient = useQueryClient();
  const query = useQuery(stateLegalBasisNormsQueryOptions(stateCode, true));
  // eslint-disable-next-line no-restricted-syntax -- complete-law pages stay local until Apply
  const [completeLawItems, setCompleteLawItems] = useState<
    LegalBasisNormItem[]
  >([]);
  // eslint-disable-next-line no-restricted-syntax -- parent-select fetch is local to this state
  const [loadingLawIds, setLoadingLawIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pendingLawIdsRef = useRef(new Set<string>());
  const built = toPickerGroups(
    [...(query.data ?? []), ...completeLawItems],
    null,
  );
  const withUnavailable = withUnavailablePersistedNorms(
    built.groups,
    new Map([
      ...built.normsById,
      ...normsById,
      ...catalogNormsByIdentity(persisted),
    ]),
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
    onLoadingChange(groupId, true);
    try {
      const items = await queryClient.fetchQuery(
        completeLawLegalBasisNormsQueryOptions({
          jurabk: group.label,
          bundesland: stateCode,
        }),
      );
      setCompleteLawItems((current) => [...current, ...items]);
      const completeCatalogNorms = items.map(legalBasisItemToCatalogNorm);
      const completeIds = completeCatalogNorms.map(normIdentityKey);
      onNormsByIdChange((current) => {
        const next = new Map(current);
        for (const catalogNorm of completeCatalogNorms) {
          next.set(normIdentityKey(catalogNorm), catalogNorm);
        }
        return next;
      });
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
      onSelectedIdsChange((current) =>
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
      onLoadingChange(groupId, false);
    }
  };

  return (
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

        onSelectedIdsChange((current) => {
          const next = new Set(current);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        const fromBuilt = withUnavailable.normsById.get(id);
        if (fromBuilt && !normsById.has(id)) {
          onNormsByIdChange((current) => {
            if (current.has(id)) {
              return current;
            }
            const next = new Map(current);
            next.set(id, fromBuilt);
            return next;
          });
        }
      }}
      onToggleGroup={(groupId) => {
        void handleToggleGroup(groupId);
      }}
      onRetry={() => {
        void query.refetch();
      }}
    />
  );
};
