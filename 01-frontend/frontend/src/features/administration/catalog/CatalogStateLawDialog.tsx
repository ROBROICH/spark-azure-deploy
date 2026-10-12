import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import {
  federalStateCodes,
  germanStateByCode,
  type FederalStateCode,
} from '@/features/project/data/project-details-form/federalStates';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';
import {
  catalogNormsByIdentity,
  selectedCatalogNorms,
} from './catalogLegalBasisPicker';
import { CatalogStateLawPicker } from './CatalogStateLawPicker';

export type CatalogStateLawDialogProps = {
  open: boolean;
  persistedByState: Record<FederalStateCode, CatalogNorm[]>;
  onOpenChange: (open: boolean) => void;
  onApply: (
    selectedByState: Partial<Record<FederalStateCode, CatalogNorm[]>>,
  ) => void;
};

/**
 * Renders the 16-state accordion and coordinates each state's dialog draft.
 *
 * @param props Persisted state selections and dialog callbacks.
 * @returns State-law picker dialog content.
 */
const CatalogStateLawDialogBody = (
  props: Omit<CatalogStateLawDialogProps, 'open'>,
) => {
  const { persistedByState, onOpenChange, onApply } = props;
  const { t } = useTranslation('Administration');
  // eslint-disable-next-line no-restricted-syntax -- expanded states are local dialog focus
  const [expanded, setExpanded] = useState<string[]>([]);
  // eslint-disable-next-line no-restricted-syntax -- dialog draft selection is discarded on close
  const [selectedByState, setSelectedByState] = useState(() => {
    const initial = {} as Record<FederalStateCode, Set<string>>;
    for (const stateCode of federalStateCodes) {
      initial[stateCode] = new Set(
        persistedByState[stateCode].map(normIdentityKey),
      );
    }
    return initial;
  });
  // eslint-disable-next-line no-restricted-syntax -- dialog draft catalog refs are discarded on close
  const [normsById, setNormsById] = useState(() => {
    const initial = new Map<string, CatalogNorm>();
    for (const stateCode of federalStateCodes) {
      for (const [id, norm] of catalogNormsByIdentity(
        persistedByState[stateCode],
      )) {
        initial.set(id, norm);
      }
    }
    return initial;
  });
  // eslint-disable-next-line no-restricted-syntax -- tracks async parent selections across state accordions
  const [loadingRequests, setLoadingRequests] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  return (
    <DialogContent
      showCloseButton
      className="h-[80vh] sm:max-w-3xl"
      innerClassName="flex-1"
    >
      <DialogHeader>
        <DialogTitle>{t('catalog.legalBasis.stateTitle')}</DialogTitle>
      </DialogHeader>
      <DialogDescription className="px-4 pt-4 text-[13px] leading-[18px] text-neutral-600">
        {t('catalog.legalBasis.stateDescription')}
      </DialogDescription>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Accordion
          type="multiple"
          value={expanded}
          onValueChange={setExpanded}
          className="flex flex-col gap-2"
        >
          {federalStateCodes.map((stateCode) => (
            <AccordionItem key={stateCode} value={stateCode}>
              <AccordionTrigger className="flex w-full items-center gap-2 py-2 text-left text-sm text-text-primary">
                <AccordionChevron />
                {germanStateByCode[stateCode]}
              </AccordionTrigger>
              <AccordionContent className="pt-2 pl-4">
                {expanded.includes(stateCode) ? (
                  <CatalogStateLawPicker
                    stateCode={stateCode}
                    persisted={persistedByState[stateCode]}
                    selectedIds={selectedByState[stateCode]}
                    normsById={normsById}
                    onSelectedIdsChange={(update) => {
                      setSelectedByState((current) => ({
                        ...current,
                        [stateCode]: update(current[stateCode]),
                      }));
                    }}
                    onNormsByIdChange={setNormsById}
                    onLoadingChange={(lawId, loading) => {
                      const requestId = `${stateCode}:${lawId}`;
                      setLoadingRequests((current) => {
                        const next = new Set(current);
                        if (loading) {
                          next.add(requestId);
                        } else {
                          next.delete(requestId);
                        }
                        return next;
                      });
                    }}
                  />
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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
          disabled={loadingRequests.size > 0}
          onClick={() => {
            const selected = {} as Partial<
              Record<FederalStateCode, CatalogNorm[]>
            >;
            for (const stateCode of federalStateCodes) {
              selected[stateCode] = selectedCatalogNorms(
                selectedByState[stateCode],
                normsById,
              );
            }
            onApply(selected);
            onOpenChange(false);
          }}
        >
          {t('catalog.legalBasis.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export function CatalogStateLawDialog(props: CatalogStateLawDialogProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CatalogStateLawDialogBody
          persistedByState={props.persistedByState}
          onOpenChange={onOpenChange}
          onApply={props.onApply}
        />
      ) : null}
    </Dialog>
  );
}
