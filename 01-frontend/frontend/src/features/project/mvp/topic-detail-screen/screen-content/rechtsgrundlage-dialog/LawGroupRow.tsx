import { Root, Indicator } from '@radix-ui/react-checkbox';
import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Book, CheckIcon, MinusIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AvailableNormEntry,
  AvailableNormLawGroup,
} from '../../screen-data/useRechtsgrundlageData.helpers';
import { NormRow } from './NormRow';
import { CHECKBOX_CLASS_NAME } from './checkboxStyles';

type LawGroupRowProps = {
  lawGroup: AvailableNormLawGroup;
  norms: AvailableNormEntry[];
  isNormSelected: (normId: string) => boolean;
  onToggleNorm: (normId: string) => void;
  onToggleGroup: (lawGroupId: string) => void;
};

const cascadeHintKeyByAction = {
  select: 'RechtsgrundlageDialog.groupCheckboxSelectHint',
  deselect: 'RechtsgrundlageDialog.groupCheckboxDeselectHint',
} as const;

/**
 * Keeps the group checkbox, cascade hint, selected-count live region, and
 * nested norm rows together so assistive labels describe the same selection.
 */
export const LawGroupRow = (props: LawGroupRowProps) => {
  const { lawGroup, norms, isNormSelected, onToggleNorm, onToggleGroup } =
    props;
  const { t } = useTranslation('MvpRedesign');

  const checkedCount = norms.filter((norm) =>
    isNormSelected(norm.norm.id),
  ).length;
  const allChecked = checkedCount === norms.length && norms.length > 0;
  const isIndeterminate = checkedCount > 0 && !allChecked;
  const checkedState = isIndeterminate
    ? 'indeterminate'
    : allChecked
      ? true
      : false;
  const cascadeHintId = useId();
  const selectedCountLiveId = useId();
  const cascadeHint =
    norms.length > 0
      ? t(cascadeHintKeyByAction[allChecked ? 'deselect' : 'select'], {
          count: norms.length,
        })
      : undefined;
  const lawGroupLabel = lawGroup.gesetz?.jurabk ?? lawGroup.id;
  const checkboxLabel = allChecked
    ? t('RechtsgrundlageDialog.groupCheckboxDeselectAriaLabel', {
        lawGroup: lawGroupLabel,
      })
    : t('RechtsgrundlageDialog.groupCheckboxSelectAriaLabel', {
        lawGroup: lawGroupLabel,
      });
  const selectedCountAnnouncement =
    checkedCount > 0
      ? t('RechtsgrundlageDialog.selectedCount', { count: checkedCount })
      : '';

  return (
    <AccordionItem value={lawGroup.id}>
      <div className="flex h-8 w-full items-center gap-2 p-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="flex w-full items-center gap-2">
            <AccordionChevron className="text-neutral-600" />

            <span className="rounded p-1 text-neutral-600">
              <Book className="size-4" />
            </span>

            <span className="flex-1 text-left text-[13px] text-neutral-600">
              {lawGroupLabel}
            </span>
          </AccordionTrigger>
        </div>

        <span id={selectedCountLiveId} className="sr-only" aria-live="polite">
          {selectedCountAnnouncement}
        </span>
        {checkedCount > 0 && (
          <span
            className="shrink-0 rounded border-[0.5px] border-neutral-400 px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-neutral-600"
            aria-hidden="true"
          >
            {selectedCountAnnouncement}
          </span>
        )}

        {cascadeHint ? (
          <span id={cascadeHintId} className="sr-only">
            {cascadeHint}
          </span>
        ) : null}

        <Root
          checked={checkedState}
          onCheckedChange={() => onToggleGroup(lawGroup.id)}
          aria-label={checkboxLabel}
          aria-describedby={cascadeHint ? cascadeHintId : undefined}
          className={CHECKBOX_CLASS_NAME}
        >
          <Indicator className="grid place-content-center text-current">
            {isIndeterminate ? (
              <MinusIcon className="size-4" />
            ) : (
              <CheckIcon className="size-4" />
            )}
          </Indicator>
        </Root>
      </div>

      <AccordionContent className="pt-2 pl-4">
        <Accordion className="flex flex-col gap-2">
          {norms.map((norm) => (
            <NormRow
              key={norm.norm.id}
              norm={norm}
              checked={isNormSelected(norm.norm.id)}
              onToggle={onToggleNorm}
            />
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
};
