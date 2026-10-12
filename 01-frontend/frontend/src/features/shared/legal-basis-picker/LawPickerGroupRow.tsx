import { Root, Indicator } from '@radix-ui/react-checkbox';
import {
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { Book, CheckIcon, MinusIcon } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { LAW_PICKER_CHECKBOX_CLASS_NAME } from './checkboxStyles';
import { countSelectedGroupNorms } from './legalBasisPicker.logic';
import type { LawPickerGroup } from './legalBasisPicker.model';
import { LawPickerNormRow } from './LawPickerNormRow';

type LawPickerGroupRowProps = {
  group: LawPickerGroup;
  selectedIds: ReadonlySet<string>;
  onToggleNorm: (id: string) => void;
  onToggleGroup: (groupId: string) => void;
};

const cascadeHintKeyByAction = {
  select: 'groupCheckboxSelectHint',
  deselect: 'groupCheckboxDeselectHint',
} as const;

/**
 * Renders one expandable law with an accessible cascading checkbox.
 *
 * @param props Law group, selection, and toggle callbacks.
 * @returns One law row and its norm rows.
 */
export const LawPickerGroupRow = (props: LawPickerGroupRowProps) => {
  const { group, selectedIds, onToggleNorm, onToggleGroup } = props;
  const { t } = useTranslation('LegalBasisPicker');
  const checkedCount = countSelectedGroupNorms(group, selectedIds);
  const selectableNorms = group.norms.filter(
    (norm) => norm.unavailable !== true,
  );
  const allSelectableChecked =
    selectableNorms.length > 0 &&
    selectableNorms.every((norm) => selectedIds.has(norm.id));
  const allChecked = group.isComplete && allSelectableChecked;
  const isIndeterminate = checkedCount > 0 && !allChecked;
  const willClear =
    allChecked || (selectableNorms.length === 0 && checkedCount > 0);
  const actionCount = willClear ? checkedCount : selectableNorms.length;
  const cascadeHintId = useId();
  const selectedCountLiveId = useId();
  const cascadeHint =
    actionCount > 0
      ? t(cascadeHintKeyByAction[willClear ? 'deselect' : 'select'], {
          count: actionCount,
        })
      : undefined;
  const selectedCountAnnouncement =
    checkedCount > 0 ? t('selectedCount', { count: checkedCount }) : '';
  const ariaDescribedBy = cascadeHint
    ? `${selectedCountLiveId} ${cascadeHintId}`
    : selectedCountLiveId;

  return (
    <AccordionItem value={group.id}>
      <div className="flex h-8 w-full items-center gap-2 p-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="flex w-full items-center gap-2">
            <AccordionChevron className="text-neutral-600" />
            <span className="rounded p-1 text-neutral-600">
              <Book className="size-4" />
            </span>
            <span className="flex-1 text-left text-[13px] text-neutral-600">
              {group.label}
            </span>
          </AccordionTrigger>
        </div>

        <span id={selectedCountLiveId} className="sr-only" aria-live="polite">
          {selectedCountAnnouncement}
        </span>
        {checkedCount > 0 ? (
          <span
            className="shrink-0 rounded border-[0.5px] border-neutral-400 px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-neutral-600"
            aria-hidden="true"
          >
            {selectedCountAnnouncement}
          </span>
        ) : null}

        {cascadeHint ? (
          <span id={cascadeHintId} className="sr-only">
            {cascadeHint}
          </span>
        ) : null}

        <Root
          checked={
            isIndeterminate ? 'indeterminate' : allChecked ? true : false
          }
          disabled={
            group.isLoadingComplete ||
            (selectableNorms.length === 0 && checkedCount === 0)
          }
          onCheckedChange={() => onToggleGroup(group.id)}
          aria-label={group.label}
          aria-describedby={ariaDescribedBy}
          className={LAW_PICKER_CHECKBOX_CLASS_NAME}
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
        <div className="flex flex-col gap-2">
          {group.norms.map((norm) => (
            <LawPickerNormRow
              key={norm.id}
              norm={norm}
              checked={selectedIds.has(norm.id)}
              onToggle={onToggleNorm}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
