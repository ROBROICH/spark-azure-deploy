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
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { SwimlaneHeader } from '@/features/ui/swimlane-header/SwimlaneHeader';
import { formatDate } from '@/i18n/formatDate';
import { ChevronLeft, ChevronRight, Clock, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LawChangeRecord } from '../data/lawChanges.types';
import { getLawChangeNormLabel } from '../data/lawChanges.utils';
import { LawChangeTextDiff } from './LawChangeTextDiff';

type LawChangeDialogProps = {
  activeLawChange: LawChangeRecord;
  canGoNext: boolean;
  canGoPrevious: boolean;
  currentIndex: number;
  normLabel?: string;
  onGoNext: () => void;
  onGoPrevious: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  totalCount: number;
};

export function LawChangeDialog(props: LawChangeDialogProps) {
  const {
    activeLawChange,
    canGoNext,
    canGoPrevious,
    currentIndex,
    normLabel,
    onGoNext,
    onGoPrevious,
    onOpenChange,
    open,
    totalCount,
  } = props;
  const { t, i18n } = useTranslation('Rpb');
  const resolvedNormLabel =
    normLabel ??
    getLawChangeNormLabel({
      jurabk: activeLawChange.jurabk,
      paragraphNr: activeLawChange.paragraphNr,
    });
  const formattedValidFrom = formatDate(
    activeLawChange.validFrom,
    i18n.resolvedLanguage,
  );
  const nextText = activeLawChange.newText.trim() || activeLawChange.changeText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[600px] sm:max-w-[904px]"
        innerClassName="flex-1"
        aria-describedby={undefined}
      >
        <DialogHeader className="justify-between gap-4 pr-16">
          <div className="min-w-0 flex-1">
            <DialogTitle>{t('rechtsaenderung.title')}</DialogTitle>
            <DialogDescription className="mt-1 text-base leading-[20px] font-medium tracking-[-0.16px] text-text-secondary">
              {resolvedNormLabel}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              aria-label={t('rechtsaenderung.previous')}
              onClick={onGoPrevious}
              disabled={!canGoPrevious}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="min-w-[72px] text-center text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary">
              {t('rechtsaenderung.position', {
                current: currentIndex + 1,
                total: totalCount,
              })}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              aria-label={t('rechtsaenderung.next')}
              onClick={onGoNext}
              disabled={!canGoNext}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col border-r border-border-primary bg-bg-secondary">
            <SwimlaneHeader
              icon={Clock}
              title={t('rechtsaenderung.bisherigNormtext')}
            />
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border-primary p-4">
              <LawChangeTextDiff
                previousText={activeLawChange.currentText}
                nextText={nextText}
                mode="old"
              />
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col bg-neutral-white">
            <SwimlaneHeader
              icon={Pencil}
              title={t('rechtsaenderung.aenderung')}
              action={
                <span className="inline-flex shrink-0 rounded border-[0.5px] border-border-secondary bg-neutral-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] whitespace-nowrap text-text-secondary shadow-sm">
                  {t('rechtsaenderung.gueltigAb', {
                    date: formattedValidFrom,
                  })}
                </span>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border-primary p-4">
              <LawChangeTextDiff
                previousText={activeLawChange.currentText}
                nextText={nextText}
                mode="new"
              />
            </div>
          </div>
        </div>
        {activeLawChange.transitionalNote.trim() !== '' ? (
          <div className="border-t border-border-primary bg-yellow-50/60 p-4">
            <Accordion type="single" collapsible>
              <AccordionItem
                value="transition-notes"
                className="rounded-lg border border-yellow-300 bg-yellow-50"
              >
                <AccordionTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-text-primary">
                  <span>{t('rechtsaenderung.transitionNotesTitle')}</span>
                  <AccordionChevron className="text-yellow-800" />
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <p className="text-[13px] leading-[18px] font-normal tracking-[-0.13px] whitespace-pre-line text-neutral-700">
                    {activeLawChange.transitionalNote}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
